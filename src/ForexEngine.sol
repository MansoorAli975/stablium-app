// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {AggregatorV3Interface} from "../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TokenConfig} from "./TokenConfig.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";

// ---- Top-level IWETH interface (needed for native-ETH UX) ----
interface IWETH {
    function deposit() external payable;

    function withdraw(uint256) external;

    function approve(address spender, uint256 amount) external returns (bool);

    function balanceOf(address account) external view returns (uint256);

    function decimals() external view returns (uint8);
}

contract ForexEngine is ReentrancyGuard, Ownable {
    using Address for address;

    // Custom Errors (legacy names kept so tests continue to pass)
    error ForexEngine__NeedsMoreThanZero();
    error ForexEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength();
    error ForexEngine__SyntheticSymbolsAndAddressesMustMatchLength();
    error ForexEngine__NotAllowedToken();
    error ForexEngine__TransferFailed();
    error ForexEngine__NotAllowedZeroAddress();
    error ForexEngine__InvalidSyntheticSymbol();
    error ForexEngine__StalePrice();
    error ForexEngine__InvalidPrice();
    error ForexEngine__InsufficientMargin();
    error ForexEngine__PositionNotLiquidated();
    error ForexEngine__InvalidLeverage();
    error ForexEngine__ContractPaused();
    error ForexEngine__InvalidTokenAddress();
    error ForexEngine__CircuitBreakerTriggered();
    error ForexEngine__InvalidTpSlPrices();
    error PositionAlreadyClosed();
    error PriceNotAtTrigger();
    error ForexEngine__WethNotSet();
    error ForexEngine__DuplicateToken();
    error ForexEngine__WithdrawalExceedsAvailable();

    // Additional compact errors used by new logic
    error ForexEngine__InvalidIndex();
    error ForexEngine__InvalidPortion();
    error ForexEngine__PositionNotOpen();
    error ForexEngine__PriceWorseThanLimit();
    error ForexEngine__InvalidBaseFeed();
    error ForexEngine__InvalidQuoteFeed();
    error ForexEngine__InvalidFeeds();
    error ForexEngine__ReserveNotSet();
    error ForexEngine__BufferTooHigh();
    error ForexEngine__NoCollateralTokens();
    error ForexEngine__SlippageCheckFailed();

    // Constants
    uint256 private constant PRECISION = 1e18;
    uint256 private constant BPS_DIVISOR = 10_000;
    uint256 private constant MAX_STALENESS = 2 hours;

    uint256 public constant MAX_LEVERAGE = 5; // 5x
    uint256 public constant MIN_MARGIN_PERCENT = 30 * 100; // 30% maint (bps)
    uint256 public constant INITIAL_MARGIN_PERCENT = 50 * 100; // 50% initial (bps)
    uint256 public constant LIQUIDATION_BONUS = 50; // 0.5% (bps)
    uint256 public constant MIN_PRICE_MOVEMENT = 5; // 0.05% (bps)

    // Tunables
    uint256 public priceTriggerBuffer = 5; // 0.05% (bps)
    uint256 public minLiquidationBuffer = 10; // 0.1% (bps)

    // State
    int256 private s_totalProtocolPnl;
    bool private s_isPaused;
    bool private s_circuitBreakerTriggered;

    mapping(address => address) private s_priceFeeds; // collateral token -> feed
    address[] private s_collateralTokens;

    mapping(address => mapping(address => uint256))
        private s_collateralDeposited;
    mapping(string => address) private s_syntheticTokens; // symbol -> token
    mapping(string => address) private s_syntheticPriceFeeds; // symbol -> feed

    mapping(address => uint256) private s_marginUsed; // USD 1e18

    address private s_protocolReserve;
    mapping(address => mapping(string => uint256))
        public s_userSyntheticExposure; // baseUnits by symbol
    mapping(string => TokenConfig) public s_tokenConfig;

    // WETH for native UX
    address private s_weth;

    struct Position {
        address user;
        string pair;
        bool isLong;
        uint256 entryPrice; // feed native units
        uint256 marginUsed; // collateral token units
        uint256 leverage;
        uint256 tradeSize; // USD notional, 1e18
        uint256 timestamp;
        bool isOpen;
        uint256 exitPrice; // feed native units
        int256 pnl; // USD 1e18
        uint256 closeTimestamp;
        uint256 takeProfitPrice; // feed native units
        uint256 stopLossPrice; // feed native units
        uint256 liquidationPrice; // feed native units (BUFFERED)
        uint256 baseUnits; // synthetic token units (token decimals)
    }

    mapping(address => Position[]) private s_userPositions;
    mapping(address => int256) private s_realizedPnl;

    // Open-position ID tracking (per user & pair)
    mapping(address => mapping(string => uint256[])) private s_openPositionIds;
    mapping(address => mapping(string => mapping(uint256 => uint256)))
        private s_openPosIndex;

    // O(1) open-position count
    mapping(address => uint256) private s_openPositionCount;

    // Events
    event CollateralDeposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );
    event CollateralRedeemed(
        address indexed from,
        address indexed to,
        address indexed token,
        uint256 amount
    );
    event PositionOpened(
        address indexed user,
        string pair,
        bool isLong,
        uint256 marginUsed,
        uint256 leverage,
        uint256 tradeSizeUsd1e18,
        uint256 entryPrice,
        uint256 liquidationPrice
    );
    event PositionClosed(
        address indexed user,
        string pair,
        bool isLong,
        uint256 marginUsed,
        uint256 tradeSizeUsd1e18,
        uint256 entryPrice,
        uint256 exitPrice,
        int256 pnlUsd1e18,
        uint256 timestamp
    );
    event PositionTpSlModified(
        uint256 indexed id,
        uint256 takeProfit,
        uint256 stopLoss,
        address indexed user
    );
    event ProtocolReserveSet(
        address indexed oldReserve,
        address indexed newReserve
    );
    event ProtocolProfitTaken(address indexed user, uint256 amount);
    event ProtocolLossCovered(address indexed user, uint256 amount);
    event UserLiquidated(
        address indexed user,
        uint256 timestamp,
        uint256 bonus
    );
    event TpSlTriggered(
        address indexed user,
        string pair,
        bool isLong,
        uint256 currentPrice,
        string reason
    );
    event CircuitBreakerTriggered(string reason);
    event CircuitBreakerReset();
    event ContractPaused();
    event ContractUnpaused();
    event WethSet(address indexed weth);
    event PartialLiquidation(
        address indexed user,
        uint256 positionIndex,
        uint256 portionBps,
        uint256 tradeSizeUsdClosed
    );

    // Modifiers
    modifier moreThanZero(uint256 amount) {
        if (amount == 0) revert ForexEngine__NeedsMoreThanZero();
        _;
    }
    modifier isAllowedToken(address token) {
        if (s_priceFeeds[token] == address(0))
            revert ForexEngine__NotAllowedToken();
        _;
    }
    modifier whenNotPaused() {
        if (s_isPaused) revert ForexEngine__ContractPaused();
        _;
    }
    modifier whenNotCircuitBreaker() {
        if (s_circuitBreakerTriggered)
            revert ForexEngine__CircuitBreakerTriggered();
        _;
    }

    constructor(
        address[] memory tokenAddresses,
        address[] memory priceFeedAddresses,
        string[] memory syntheticSymbols,
        address[] memory syntheticTokenAddresses,
        TokenConfig[] memory syntheticConfigs,
        address[] memory syntheticPriceFeeds
    ) {
        if (tokenAddresses.length != priceFeedAddresses.length) {
            revert ForexEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength();
        }
        if (
            syntheticSymbols.length != syntheticTokenAddresses.length ||
            syntheticSymbols.length != syntheticConfigs.length ||
            syntheticSymbols.length != syntheticPriceFeeds.length
        ) {
            revert ForexEngine__SyntheticSymbolsAndAddressesMustMatchLength();
        }

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            _validateTokenAddress(tokenAddresses[i]);
            _validatePriceFeed(priceFeedAddresses[i]);
            if (s_priceFeeds[tokenAddresses[i]] != address(0))
                revert ForexEngine__DuplicateToken();
            s_priceFeeds[tokenAddresses[i]] = priceFeedAddresses[i];
            s_collateralTokens.push(tokenAddresses[i]);
        }

        for (uint256 j = 0; j < syntheticSymbols.length; j++) {
            string memory symbol = syntheticSymbols[j];
            _validateTokenAddress(syntheticTokenAddresses[j]);
            _validatePriceFeed(syntheticPriceFeeds[j]);
            if (s_syntheticTokens[symbol] != address(0))
                revert ForexEngine__DuplicateToken();
            s_syntheticTokens[symbol] = syntheticTokenAddresses[j];
            s_tokenConfig[symbol] = syntheticConfigs[j];
            s_syntheticPriceFeeds[symbol] = syntheticPriceFeeds[j];
            // NOTE: removed s_syntheticSymbols push for size
        }
    }

    // ===================== Core =====================

    /**
     * @param maxSlippage Slippage guard in BPS vs oracle price (long: min acceptable, short: max acceptable)
     */
    function openPosition(
        string memory pair,
        bool isLong,
        uint256 marginAmount,
        uint256 leverage,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        uint256 maxSlippage
    ) external nonReentrant whenNotPaused whenNotCircuitBreaker {
        if (leverage == 0 || leverage > MAX_LEVERAGE)
            revert ForexEngine__InvalidLeverage();
        if (marginAmount == 0) revert ForexEngine__NeedsMoreThanZero();

        address feedAddr = s_syntheticPriceFeeds[pair];
        if (feedAddr == address(0))
            revert ForexEngine__InvalidSyntheticSymbol();

        (, int256 entryPriceRaw, , uint256 updatedAt, ) = AggregatorV3Interface(
            feedAddr
        ).latestRoundData();
        _validatePrice(entryPriceRaw, updatedAt);
        uint256 entryPrice = uint256(entryPriceRaw);

        if (maxSlippage > 0) {
            if (isLong) {
                uint256 minOk = (entryPrice * (BPS_DIVISOR - maxSlippage)) /
                    BPS_DIVISOR;
                if (entryPrice < minOk)
                    revert ForexEngine__SlippageCheckFailed();
            } else {
                uint256 maxOk = (entryPrice * (BPS_DIVISOR + maxSlippage)) /
                    BPS_DIVISOR;
                if (entryPrice > maxOk)
                    revert ForexEngine__SlippageCheckFailed();
            }
        }

        // liquidationPrice includes buffer at OPEN
        uint256 liquidationPrice = _calculateLiquidationPrice(
            entryPrice,
            isLong,
            leverage
        );

        if (takeProfitPrice > 0 || stopLossPrice > 0) {
            _validateTpSlPrices(
                entryPrice,
                takeProfitPrice,
                stopLossPrice,
                isLong
            );
        }

        _validateMarginRequirements(msg.sender, marginAmount, leverage);

        // USD notional and base units
        address baseCol = _baseCollateral();
        uint256 notionalUsd1e18 = _notionalUsd1e18(
            marginAmount,
            leverage,
            baseCol
        );

        address sToken = s_syntheticTokens[pair];
        if (sToken == address(0)) revert ForexEngine__InvalidSyntheticSymbol();
        uint256 baseUnits = _baseUnitsForNotional(
            notionalUsd1e18,
            entryPrice,
            sToken,
            feedAddr
        );

        ISyntheticToken(sToken).mint(address(this), baseUnits);
        s_userSyntheticExposure[msg.sender][pair] =
            s_userSyntheticExposure[msg.sender][pair] +
            baseUnits;

        uint256 positionIndex = s_userPositions[msg.sender].length;
        s_userPositions[msg.sender].push(
            Position({
                user: msg.sender,
                pair: pair,
                isLong: isLong,
                entryPrice: entryPrice,
                marginUsed: marginAmount,
                leverage: leverage,
                tradeSize: notionalUsd1e18,
                timestamp: block.timestamp,
                isOpen: true,
                exitPrice: 0,
                pnl: 0,
                closeTimestamp: 0,
                takeProfitPrice: takeProfitPrice,
                stopLossPrice: stopLossPrice,
                liquidationPrice: liquidationPrice,
                baseUnits: baseUnits
            })
        );
        _trackOpenPosition(msg.sender, pair, positionIndex);
        s_openPositionCount[msg.sender] += 1;

        uint256 marginAmountUSD = _convertToUSD(baseCol, marginAmount);
        s_marginUsed[msg.sender] = s_marginUsed[msg.sender] + marginAmountUSD;

        emit PositionOpened(
            msg.sender,
            pair,
            isLong,
            marginAmount,
            leverage,
            notionalUsd1e18,
            entryPrice,
            liquidationPrice
        );
    }

    function closePosition(
        uint256 index,
        uint256 priceBound
    ) external nonReentrant whenNotPaused {
        if (index >= s_userPositions[msg.sender].length)
            revert ForexEngine__InvalidIndex();
        Position storage position = s_userPositions[msg.sender][index];
        if (!position.isOpen) revert PositionAlreadyClosed();

        _closePosition(msg.sender, index, false, priceBound);
    }

    // ===================== Collateral =====================

    function depositCollateral(
        address token,
        uint256 amount
    )
        external
        moreThanZero(amount)
        isAllowedToken(token)
        nonReentrant
        whenNotPaused
    {
        s_collateralDeposited[msg.sender][token] =
            s_collateralDeposited[msg.sender][token] +
            amount;
        emit CollateralDeposited(msg.sender, token, amount);

        bool success = IERC20(token).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        if (!success) revert ForexEngine__TransferFailed();
    }

    function redeemCollateral(
        address token,
        uint256 amount
    ) external moreThanZero(amount) nonReentrant whenNotPaused {
        uint256 available = getAvailableToWithdraw(msg.sender, token);
        if (amount > available)
            revert ForexEngine__WithdrawalExceedsAvailable();

        s_collateralDeposited[msg.sender][token] =
            s_collateralDeposited[msg.sender][token] -
            amount;
        emit CollateralRedeemed(msg.sender, msg.sender, token, amount);

        bool success = IERC20(token).transfer(msg.sender, amount);
        if (!success) revert ForexEngine__TransferFailed();
    }

    // ---- Native ETH UX (wrap to WETH on deposit; unwrap on withdraw) ----

    function setWeth(address weth) external onlyOwner {
        _validateTokenAddress(weth);
        s_weth = weth;

        bool exists = false;
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            if (s_collateralTokens[i] == weth) {
                exists = true;
                break;
            }
        }
        if (!exists) s_collateralTokens.push(weth);

        emit WethSet(weth);
    }

    function getWeth() external view returns (address) {
        return s_weth;
    }

    function depositETH() external payable nonReentrant whenNotPaused {
        if (s_weth == address(0)) revert ForexEngine__WethNotSet();
        if (msg.value == 0) revert ForexEngine__NeedsMoreThanZero();

        IWETH(s_weth).deposit{value: msg.value}();
        s_collateralDeposited[msg.sender][s_weth] =
            s_collateralDeposited[msg.sender][s_weth] +
            msg.value;

        emit CollateralDeposited(msg.sender, s_weth, msg.value);
    }

    function withdrawETH(
        uint256 amount
    ) external nonReentrant whenNotPaused moreThanZero(amount) {
        if (s_weth == address(0)) revert ForexEngine__WethNotSet();

        uint256 available = getAvailableToWithdraw(msg.sender, s_weth);
        if (amount > available)
            revert ForexEngine__WithdrawalExceedsAvailable();

        s_collateralDeposited[msg.sender][s_weth] =
            s_collateralDeposited[msg.sender][s_weth] -
            amount;

        IWETH(s_weth).withdraw(amount);
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert ForexEngine__TransferFailed();

        emit CollateralRedeemed(msg.sender, msg.sender, s_weth, amount);
    }

    // ===================== Risk =====================

    function checkAndLiquidate(address user) external nonReentrant {
        _checkAndLiquidate(user, 0, 50);
    }

    function checkAndLiquidateRange(
        address user,
        uint256 start,
        uint256 maxCount
    ) external nonReentrant {
        _checkAndLiquidate(user, start, maxCount);
    }

    function _checkAndLiquidate(
        address user,
        uint256 start,
        uint256 maxCount
    ) internal {
        uint256 marginRatioBps = getUserMarginRatio(user);
        if (marginRatioBps >= MIN_MARGIN_PERCENT)
            revert ForexEngine__PositionNotLiquidated();

        Position[] storage positions = s_userPositions[user];
        uint256 len = positions.length;
        if (start >= len || maxCount == 0) return;

        uint256 end = start + maxCount;
        if (end > len) end = len;

        uint256 totalBonus = 0;

        for (uint256 i = start; i < end; i++) {
            if (positions[i].isOpen) {
                address feedAddr = s_syntheticPriceFeeds[positions[i].pair];
                (
                    ,
                    int256 currentPriceRaw,
                    ,
                    uint256 updatedAt,

                ) = AggregatorV3Interface(feedAddr).latestRoundData();
                _validatePrice(currentPriceRaw, updatedAt);
                uint256 currentPrice = uint256(currentPriceRaw);

                if (_shouldLiquidate(positions[i], currentPrice)) {
                    totalBonus = totalBonus + _liquidatePosition(user, i);
                }
            }
        }

        if (totalBonus > 0)
            emit UserLiquidated(user, block.timestamp, totalBonus);
    }

    function partiallyLiquidatePosition(
        address user,
        uint256 index,
        uint256 portionBps
    ) external nonReentrant onlyOwner {
        if (portionBps == 0 || portionBps > BPS_DIVISOR)
            revert ForexEngine__InvalidPortion();
        if (index >= s_userPositions[user].length)
            revert ForexEngine__InvalidIndex();

        Position storage position = s_userPositions[user][index];
        if (!position.isOpen) revert ForexEngine__PositionNotOpen();

        address feedAddr = s_syntheticPriceFeeds[position.pair];
        (
            ,
            int256 currentPriceRaw,
            ,
            uint256 updatedAt,

        ) = AggregatorV3Interface(feedAddr).latestRoundData();
        _validatePrice(currentPriceRaw, updatedAt);
        uint256 currentPrice = uint256(currentPriceRaw);

        if (!_shouldLiquidate(position, currentPrice))
            revert ForexEngine__PositionNotLiquidated();

        // Proportional amounts
        uint256 closeTradeUsd = (position.tradeSize * portionBps) / BPS_DIVISOR; // USD 1e18
        uint256 closeBaseUnits = (position.baseUnits * portionBps) /
            BPS_DIVISOR;
        uint256 closeMargin = (position.marginUsed * portionBps) / BPS_DIVISOR;

        _closePositionPortion(
            user,
            index,
            closeMargin,
            closeTradeUsd,
            closeBaseUnits,
            currentPrice
        );

        // Update remaining exposure
        position.marginUsed = position.marginUsed - closeMargin;
        position.tradeSize = position.tradeSize - closeTradeUsd;
        position.baseUnits = position.baseUnits - closeBaseUnits;

        // If fully closed after partial
        if (position.baseUnits == 0) {
            position.isOpen = false;
            position.exitPrice = currentPrice;
            position.closeTimestamp = block.timestamp;
            _untrackOpenPosition(user, position.pair, index);
            if (s_openPositionCount[user] > 0) s_openPositionCount[user] -= 1;
        }

        emit PartialLiquidation(user, index, portionBps, closeTradeUsd);
    }

    // NEW: Modify TP/SL on an open position owned by msg.sender (0 = clear)
    function setTpSl(
        uint256 index,
        uint256 tp,
        uint256 sl
    ) external nonReentrant whenNotPaused {
        if (index >= s_userPositions[msg.sender].length)
            revert ForexEngine__InvalidIndex();
        Position storage p = s_userPositions[msg.sender][index];
        if (!p.isOpen) revert PositionAlreadyClosed();

        if (tp > 0 || sl > 0) {
            _validateTpSlPrices(p.entryPrice, tp, sl, p.isLong);
        }

        p.takeProfitPrice = tp; // 0 clears
        p.stopLossPrice = sl; // 0 clears

        emit PositionTpSlModified(index, tp, sl, msg.sender);
    }

    function checkTpSlAndClose(
        uint256 index
    ) external nonReentrant whenNotPaused returns (bool closed) {
        if (index >= s_userPositions[msg.sender].length)
            revert ForexEngine__InvalidIndex();
        Position storage p = s_userPositions[msg.sender][index];
        if (!p.isOpen) revert PositionAlreadyClosed();

        address feedAddr = s_syntheticPriceFeeds[p.pair];
        if (feedAddr == address(0))
            revert ForexEngine__InvalidSyntheticSymbol();

        (, int256 answer, , uint256 updatedAt, ) = AggregatorV3Interface(
            feedAddr
        ).latestRoundData();
        _validatePrice(answer, updatedAt);
        uint256 current = uint256(answer);

        uint256 adjusted = _applyPriceBuffer(current, p.isLong);

        bool tpHit = (p.takeProfitPrice > 0) &&
            (
                p.isLong
                    ? adjusted >= p.takeProfitPrice
                    : adjusted <= p.takeProfitPrice
            );
        bool slHit = (p.stopLossPrice > 0) &&
            (
                p.isLong
                    ? adjusted <= p.stopLossPrice
                    : adjusted >= p.stopLossPrice
            );

        if (!(tpHit || slHit)) revert PriceNotAtTrigger();

        emit TpSlTriggered(
            msg.sender,
            p.pair,
            p.isLong,
            current,
            tpHit ? "TP" : "SL"
        );
        _closePosition(msg.sender, index, false, 0);
        return true;
    }

    function _applyPriceBuffer(
        uint256 price,
        bool isLong
    ) internal view returns (uint256) {
        return
            isLong
                ? (price * (BPS_DIVISOR - priceTriggerBuffer)) / BPS_DIVISOR
                : (price * (BPS_DIVISOR + priceTriggerBuffer)) / BPS_DIVISOR;
    }

    function _shouldLiquidate(
        Position memory position,
        uint256 currentPrice
    ) internal pure returns (bool) {
        return
            position.isLong
                ? (currentPrice <= position.liquidationPrice)
                : (currentPrice >= position.liquidationPrice);
    }

    function getAvailableToWithdraw(
        address user,
        address token
    ) public view returns (uint256) {
        uint256 userTokenBal = s_collateralDeposited[user][token];
        if (userTokenBal == 0) return 0;

        (
            bool okTotal,
            uint256 totalCollateralUsd
        ) = _getTotalCollateralValue_safe(user);
        if (!okTotal) return 0;

        uint256 usedMarginUsd = s_marginUsed[user];
        if (usedMarginUsd == 0) {
            return userTokenBal;
        }

        uint256 maintReqUsd = (usedMarginUsd * MIN_MARGIN_PERCENT) /
            BPS_DIVISOR;
        if (totalCollateralUsd <= maintReqUsd) return 0;

        uint256 availableUsd = totalCollateralUsd - maintReqUsd;

        address feed = s_priceFeeds[token];
        (bool okPrice, uint256 p1e18) = _safePrice1e18(feed);
        if (!okPrice || p1e18 == 0) return 0;

        uint8 tokenDecimals = ERC20(token).decimals();
        uint256 tokenAmount1e18 = (availableUsd * PRECISION) / p1e18;

        uint256 tokenAmount = (tokenDecimals >= 18)
            ? tokenAmount1e18 * (10 ** (tokenDecimals - 18))
            : tokenAmount1e18 / (10 ** (18 - tokenDecimals));

        return tokenAmount > userTokenBal ? userTokenBal : tokenAmount;
    }

    // ===================== Admin =====================

    function setSyntheticPriceFeed(
        string memory symbol,
        address newFeed
    ) external onlyOwner {
        if (bytes(symbol).length == 0 || newFeed == address(0))
            revert ForexEngine__NotAllowedZeroAddress();
        _validatePriceFeed(newFeed);
        s_syntheticPriceFeeds[symbol] = newFeed;
    }

    function setCollateralToken(
        address token,
        address priceFeed
    ) external onlyOwner {
        if (token == address(0) || priceFeed == address(0))
            revert ForexEngine__NotAllowedZeroAddress();
        _validateTokenAddress(token);
        _validatePriceFeed(priceFeed);

        s_priceFeeds[token] = priceFeed;

        bool exists = false;
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            if (s_collateralTokens[i] == token) {
                exists = true;
                break;
            }
        }
        if (!exists) s_collateralTokens.push(token);
    }

    function setProtocolReserveWallet(address newReserve) external onlyOwner {
        if (newReserve == address(0))
            revert ForexEngine__NotAllowedZeroAddress();
        address old = s_protocolReserve;
        s_protocolReserve = newReserve;
        emit ProtocolReserveSet(old, newReserve);
    }

    function triggerCircuitBreaker(string memory reason) external onlyOwner {
        s_circuitBreakerTriggered = true;
        emit CircuitBreakerTriggered(reason);
    }

    function resetCircuitBreaker() external onlyOwner {
        s_circuitBreakerTriggered = false;
        emit CircuitBreakerReset();
    }

    function pauseContract() external onlyOwner {
        s_isPaused = true;
        emit ContractPaused();
    }

    function unpauseContract() external onlyOwner {
        s_isPaused = false;
        emit ContractUnpaused();
    }

    // Combined setter to save bytes
    function setBuffers(
        uint256 priceBuffer,
        uint256 liquidationBuffer
    ) external onlyOwner {
        if (priceBuffer > 1000 || liquidationBuffer > 1000)
            revert ForexEngine__BufferTooHigh(); // Max 10% each
        priceTriggerBuffer = priceBuffer;
        minLiquidationBuffer = liquidationBuffer;
    }

    // ===================== Internal =====================

    function _closePosition(
        address user,
        uint256 index,
        bool isLiquidation,
        uint256 priceBound
    ) internal returns (uint256) {
        Position storage position = s_userPositions[user][index];
        if (!position.isOpen) return 0;

        address feedAddr = s_syntheticPriceFeeds[position.pair];
        if (feedAddr == address(0))
            revert ForexEngine__InvalidSyntheticSymbol();

        (, int256 exitPriceRaw, , uint256 updatedAt, ) = AggregatorV3Interface(
            feedAddr
        ).latestRoundData();
        _validatePrice(exitPriceRaw, updatedAt);
        uint256 exitPrice = uint256(exitPriceRaw);

        if (priceBound != 0) {
            if (position.isLong) {
                if (exitPrice < priceBound)
                    revert ForexEngine__PriceWorseThanLimit();
            } else {
                if (exitPrice > priceBound)
                    revert ForexEngine__PriceWorseThanLimit();
            }
        }

        // -------- PnL: base size * (exit - entry), in 1e18 --------
        address sToken = s_syntheticTokens[position.pair];
        uint8 stDec = ERC20(sToken).decimals();
        uint8 pDec = AggregatorV3Interface(feedAddr).decimals();

        uint256 base1e18 = (stDec >= 18)
            ? position.baseUnits * (10 ** (18 - stDec))
            : position.baseUnits / (10 ** (18 - stDec));
        uint256 entry1e18 = _normalizePrice1e18(
            int256(position.entryPrice),
            pDec
        );
        uint256 exit1e18 = _normalizePrice1e18(int256(exitPrice), pDec);

        int256 pnl = position.isLong
            ? (int256(base1e18) * (int256(exit1e18) - int256(entry1e18))) /
                int256(PRECISION)
            : (int256(base1e18) * (int256(entry1e18) - int256(exit1e18))) /
                int256(PRECISION);
        // -----------------------------------------------------------

        ISyntheticToken(sToken).burn(position.baseUnits);
        s_userSyntheticExposure[user][position.pair] =
            s_userSyntheticExposure[user][position.pair] -
            position.baseUnits;

        uint256 marginUSD = _convertToUSD(
            _baseCollateral(),
            position.marginUsed
        );
        s_marginUsed[user] = s_marginUsed[user] - marginUSD;

        address baseToken = _baseCollateral();
        uint256 bonusAmount = 0;

        if (pnl >= 0) {
            if (s_protocolReserve == address(0))
                revert ForexEngine__ReserveNotSet();
            uint256 profit = uint256(pnl);

            if (isLiquidation) {
                bonusAmount = (profit * LIQUIDATION_BONUS) / BPS_DIVISOR;
                profit = profit - bonusAmount;
            }

            uint256 protocolBalance = IERC20(baseToken).balanceOf(
                s_protocolReserve
            );
            if (protocolBalance < profit) profit = protocolBalance;

            if (profit > 0) {
                bool success = IERC20(baseToken).transferFrom(
                    s_protocolReserve,
                    address(this),
                    profit
                );
                if (!success) revert ForexEngine__TransferFailed();
                s_collateralDeposited[user][baseToken] =
                    s_collateralDeposited[user][baseToken] +
                    profit;
            }

            if (bonusAmount > 0) {
                s_collateralDeposited[msg.sender][baseToken] =
                    s_collateralDeposited[msg.sender][baseToken] +
                    bonusAmount;
            }

            emit ProtocolLossCovered(user, profit);
        } else {
            uint256 loss = uint256(-pnl);
            uint256 userBalance = s_collateralDeposited[user][baseToken];
            if (loss > userBalance) loss = userBalance;

            s_collateralDeposited[user][baseToken] =
                s_collateralDeposited[user][baseToken] -
                loss;

            if (isLiquidation) {
                bonusAmount = (loss * LIQUIDATION_BONUS) / BPS_DIVISOR;
                loss = loss - bonusAmount;
                s_collateralDeposited[msg.sender][baseToken] =
                    s_collateralDeposited[msg.sender][baseToken] +
                    bonusAmount;
            }

            bool xferOk = IERC20(baseToken).transfer(s_protocolReserve, loss);
            if (!xferOk) revert ForexEngine__TransferFailed();
            emit ProtocolProfitTaken(user, loss);
        }

        position.exitPrice = exitPrice;
        position.pnl = pnl;
        position.closeTimestamp = block.timestamp;
        position.isOpen = false;
        _untrackOpenPosition(user, position.pair, index);
        if (s_openPositionCount[user] > 0) s_openPositionCount[user] -= 1;

        s_realizedPnl[user] = s_realizedPnl[user] + pnl;
        s_totalProtocolPnl = s_totalProtocolPnl - pnl;

        emit PositionClosed(
            user,
            position.pair,
            position.isLong,
            position.marginUsed,
            position.tradeSize,
            position.entryPrice,
            exitPrice,
            pnl,
            block.timestamp
        );

        return bonusAmount;
    }

    // Close a portion with correct PnL math
    function _closePositionPortion(
        address user,
        uint256 index,
        uint256 marginAmount,
        uint256 /* tradeUsd1e18 */,
        uint256 baseUnits,
        uint256 exitPrice
    ) internal {
        Position storage position = s_userPositions[user][index];

        address sToken = s_syntheticTokens[position.pair];
        uint8 stDec = ERC20(sToken).decimals();
        uint8 pDec = AggregatorV3Interface(s_syntheticPriceFeeds[position.pair])
            .decimals();

        uint256 base1e18 = (stDec >= 18)
            ? baseUnits * (10 ** (18 - stDec))
            : baseUnits / (10 ** (18 - stDec));
        uint256 entry1e18 = _normalizePrice1e18(
            int256(position.entryPrice),
            pDec
        );
        uint256 exit1e18 = _normalizePrice1e18(int256(exitPrice), pDec);

        int256 pnl = position.isLong
            ? (int256(base1e18) * (int256(exit1e18) - int256(entry1e18))) /
                int256(PRECISION)
            : (int256(base1e18) * (int256(entry1e18) - int256(exit1e18))) /
                int256(PRECISION);

        ISyntheticToken(sToken).burn(baseUnits);
        s_userSyntheticExposure[user][position.pair] =
            s_userSyntheticExposure[user][position.pair] -
            baseUnits;

        uint256 marginUSD = _convertToUSD(_baseCollateral(), marginAmount);
        s_marginUsed[user] = s_marginUsed[user] - marginUSD;

        address baseToken = _baseCollateral();

        if (pnl >= 0) {
            if (s_protocolReserve == address(0))
                revert ForexEngine__ReserveNotSet();
            uint256 profit = uint256(pnl);

            uint256 protocolBalance = IERC20(baseToken).balanceOf(
                s_protocolReserve
            );
            if (protocolBalance < profit) profit = protocolBalance;

            if (profit > 0) {
                bool success = IERC20(baseToken).transferFrom(
                    s_protocolReserve,
                    address(this),
                    profit
                );
                if (!success) revert ForexEngine__TransferFailed();
                s_collateralDeposited[user][baseToken] =
                    s_collateralDeposited[user][baseToken] +
                    profit;
            }

            emit ProtocolLossCovered(user, profit);
        } else {
            uint256 loss = uint256(-pnl);
            uint256 userBalance = s_collateralDeposited[user][baseToken];
            if (loss > userBalance) loss = userBalance;

            s_collateralDeposited[user][baseToken] =
                s_collateralDeposited[user][baseToken] -
                loss;

            bool xferOk = IERC20(baseToken).transfer(s_protocolReserve, loss);
            if (!xferOk) revert ForexEngine__TransferFailed();

            emit ProtocolProfitTaken(user, loss);
        }

        s_realizedPnl[user] = s_realizedPnl[user] + pnl;
        s_totalProtocolPnl = s_totalProtocolPnl - pnl;
    }

    function _liquidatePosition(
        address user,
        uint256 index
    ) internal returns (uint256) {
        return _closePosition(user, index, true, 0);
    }

    // -------- Safe / strict pricing & margin helpers --------

    function _validatePrice(int256 price, uint256 updatedAt) internal view {
        if (price <= 0) revert ForexEngine__InvalidPrice();
        if (
            block.timestamp > updatedAt &&
            block.timestamp - updatedAt > MAX_STALENESS
        ) {
            revert ForexEngine__StalePrice();
        }
    }

    // Non-reverting safe price in 1e18
    function _safePrice1e18(
        address feed
    ) internal view returns (bool ok, uint256 price1e18) {
        if (feed == address(0) || !feed.isContract()) return (false, 0);
        try AggregatorV3Interface(feed).latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (answer <= 0) return (false, 0);
            if (
                block.timestamp > updatedAt &&
                block.timestamp - updatedAt > MAX_STALENESS
            ) return (false, 0);
            try AggregatorV3Interface(feed).decimals() returns (uint8 d) {
                return (true, _normalizePrice1e18(answer, d));
            } catch {
                return (false, 0);
            }
        } catch {
            return (false, 0);
        }
    }

    // Safe USD conversion (returns ok + usd in 1e18)
    function _convertToUSD_safe(
        address token,
        uint256 amount
    ) internal view returns (bool ok, uint256 usd1e18) {
        address feedAddr = s_priceFeeds[token];
        (bool okp, uint256 p1e18) = _safePrice1e18(feedAddr);
        if (!okp) return (false, 0);
        uint8 td = ERC20(token).decimals();
        uint256 a1e18 = _normalizeAmount1e18(amount, td);
        return (true, (a1e18 * p1e18) / PRECISION);
    }

    function _getTotalCollateralValue_safe(
        address user
    ) internal view returns (bool ok, uint256 total) {
        total = 0;
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            address token = s_collateralTokens[i];
            uint256 amount = s_collateralDeposited[user][token];
            if (amount == 0) continue;
            (bool okc, uint256 usd1e18) = _convertToUSD_safe(token, amount);
            if (!okc) return (false, 0);
            total = total + usd1e18;
        }
        return (true, total);
    }

    function _validateMarginRequirements(
        address user,
        uint256 marginAmount,
        uint256 leverage
    ) internal view {
        (
            bool okTotal,
            uint256 totalCollateralUsd
        ) = _getTotalCollateralValue_safe(user);
        if (!okTotal) revert ForexEngine__StalePrice();

        (bool okNewMargin, uint256 newMarginUsd) = _convertToUSD_safe(
            _baseCollateral(),
            marginAmount
        );
        if (!okNewMargin) revert ForexEngine__StalePrice();

        (bool okNotional, uint256 positionNotionalUsd) = _convertToUSD_safe(
            _baseCollateral(),
            marginAmount * leverage
        );
        if (!okNotional) revert ForexEngine__StalePrice();

        uint256 newUsedMargin = s_marginUsed[user] + newMarginUsd;
        uint256 requiredMarginUsd = (positionNotionalUsd *
            INITIAL_MARGIN_PERCENT) / BPS_DIVISOR;

        if (totalCollateralUsd < requiredMarginUsd)
            revert ForexEngine__InsufficientMargin();
        if (
            totalCollateralUsd * BPS_DIVISOR <
            newUsedMargin * MIN_MARGIN_PERCENT
        ) {
            revert ForexEngine__InsufficientMargin();
        }
    }

    function _validateTokenAddress(address token) internal view {
        if (token == address(0)) revert ForexEngine__NotAllowedZeroAddress();
        if (!token.isContract()) revert ForexEngine__InvalidTokenAddress();
    }

    function _validatePriceFeed(address feed) internal view {
        if (feed == address(0)) revert ForexEngine__NotAllowedZeroAddress();
        if (!feed.isContract()) revert ForexEngine__InvalidTokenAddress();
        try AggregatorV3Interface(feed).decimals() returns (uint8) {} catch {
            revert ForexEngine__InvalidTokenAddress();
        }
    }

    function _validateTpSlPrices(
        uint256 entryPrice,
        uint256 takeProfitPrice,
        uint256 stopLossPrice,
        bool isLong
    ) internal pure {
        if (isLong) {
            if (takeProfitPrice > 0 && takeProfitPrice <= entryPrice)
                revert ForexEngine__InvalidTpSlPrices();
            if (stopLossPrice > 0 && stopLossPrice >= entryPrice)
                revert ForexEngine__InvalidTpSlPrices();
            if (
                stopLossPrice > 0 &&
                takeProfitPrice > 0 &&
                stopLossPrice >= takeProfitPrice
            ) {
                revert ForexEngine__InvalidTpSlPrices();
            }
        } else {
            if (takeProfitPrice > 0 && takeProfitPrice >= entryPrice)
                revert ForexEngine__InvalidTpSlPrices();
            if (stopLossPrice > 0 && stopLossPrice <= entryPrice)
                revert ForexEngine__InvalidTpSlPrices();
            if (
                stopLossPrice > 0 &&
                takeProfitPrice > 0 &&
                stopLossPrice <= takeProfitPrice
            ) {
                revert ForexEngine__InvalidTpSlPrices();
            }
        }
        if (
            takeProfitPrice > 0 &&
            !_hasSufficientPriceMovement(entryPrice, takeProfitPrice)
        ) {
            revert ForexEngine__InvalidTpSlPrices();
        }
        if (
            stopLossPrice > 0 &&
            !_hasSufficientPriceMovement(entryPrice, stopLossPrice)
        ) {
            revert ForexEngine__InvalidTpSlPrices();
        }
    }

    function _hasSufficientPriceMovement(
        uint256 entryPrice,
        uint256 currentPrice
    ) internal pure returns (bool) {
        uint256 priceChangeBps = currentPrice > entryPrice
            ? ((currentPrice - entryPrice) * BPS_DIVISOR) / entryPrice
            : ((entryPrice - currentPrice) * BPS_DIVISOR) / entryPrice;
        return priceChangeBps >= MIN_PRICE_MOVEMENT;
    }

    // >>> Liquidation buffer baked into liquidationPrice <<<
    function _calculateLiquidationPrice(
        uint256 entryPrice,
        bool isLong,
        uint256 leverage
    ) internal view returns (uint256) {
        uint256 leverageFactor = PRECISION / leverage; // 1/leverage in 1e18
        uint256 marginBuffer = (MIN_MARGIN_PERCENT * PRECISION) / BPS_DIVISOR; // maint in 1e18
        uint256 bufferAdj = (minLiquidationBuffer * PRECISION) / BPS_DIVISOR; // buffer in 1e18

        if (isLong) {
            return
                (entryPrice *
                    (PRECISION - leverageFactor + marginBuffer + bufferAdj)) /
                PRECISION;
        } else {
            return
                (entryPrice *
                    (PRECISION + leverageFactor - marginBuffer - bufferAdj)) /
                PRECISION;
        }
    }

    // ----- Notional & Units helpers -----

    function _notionalUsd1e18(
        uint256 marginAmount,
        uint256 leverage,
        address collateralToken
    ) internal view returns (uint256) {
        uint256 marginUsd = _convertToUSD(collateralToken, marginAmount); // strict (reverts on stale)
        return marginUsd * leverage;
    }

    function _baseUnitsForNotional(
        uint256 notionalUsd1e18,
        uint256 entryPrice, // feed native units
        address syntheticToken, // sToken
        address priceFeed // base/USD feed
    ) internal view returns (uint256) {
        uint8 stDec = ERC20(syntheticToken).decimals();
        uint8 pDec = AggregatorV3Interface(priceFeed).decimals();

        uint256 price1e18 = _normalizePrice1e18(int256(entryPrice), pDec); // USD per 1 base in 1e18
        uint256 base1e18 = (notionalUsd1e18 * PRECISION) / price1e18; // base amount in 1e18

        if (stDec >= 18) return base1e18 * (10 ** (stDec - 18));
        return base1e18 / (10 ** (18 - stDec));
    }

    // ===================== Views =====================

    function getUserMarginRatio(
        address user
    ) public view returns (uint256 marginRatioBps) {
        uint256 totalCollateralUsd = _getTotalCollateralValue(user); // strict
        uint256 usedMarginUsd = s_marginUsed[user];

        if (usedMarginUsd == 0) return BPS_DIVISOR;

        int256 totalUnrealizedPnl = 0;
        Position[] memory positions = s_userPositions[user];

        for (uint256 i = 0; i < positions.length; i++) {
            if (!positions[i].isOpen) continue;

            address feedAddr = s_syntheticPriceFeeds[positions[i].pair];
            if (feedAddr == address(0)) revert ForexEngine__InvalidBaseFeed();
            (, int256 curP, , uint256 updatedAt, ) = AggregatorV3Interface(
                feedAddr
            ).latestRoundData();
            _validatePrice(curP, updatedAt);

            uint8 pDec = AggregatorV3Interface(feedAddr).decimals();
            uint256 current1e18 = _normalizePrice1e18(curP, pDec);
            uint256 entry1e18 = _normalizePrice1e18(
                int256(positions[i].entryPrice),
                pDec
            );

            address sToken = s_syntheticTokens[positions[i].pair];
            uint8 stDec = ERC20(sToken).decimals();
            uint256 base1e18 = (stDec >= 18)
                ? positions[i].baseUnits * (10 ** (18 - stDec))
                : positions[i].baseUnits / (10 ** (18 - stDec));

            int256 pnl = positions[i].isLong
                ? (int256(base1e18) *
                    (int256(current1e18) - int256(entry1e18))) /
                    int256(PRECISION)
                : (int256(base1e18) *
                    (int256(entry1e18) - int256(current1e18))) /
                    int256(PRECISION);

            totalUnrealizedPnl += pnl;
        }

        int256 equity = int256(totalCollateralUsd) + totalUnrealizedPnl; // 1e18
        if (equity <= 0) return 0;

        marginRatioBps = (uint256(equity) * BPS_DIVISOR) / usedMarginUsd;
    }

    function _price1e18(address feed) internal view returns (uint256) {
        (, int256 p, , uint256 updatedAt, ) = AggregatorV3Interface(feed)
            .latestRoundData();
        _validatePrice(p, updatedAt);
        uint8 d = AggregatorV3Interface(feed).decimals();
        return _normalizePrice1e18(p, d);
    }

    function getDerivedPrice(
        string memory baseCurrency,
        string memory quoteCurrency
    ) public view returns (uint256) {
        bytes32 USD = keccak256(bytes("USD"));
        bytes32 b = keccak256(bytes(baseCurrency));
        bytes32 q = keccak256(bytes(quoteCurrency));

        address baseFeed = s_syntheticPriceFeeds[baseCurrency];
        address quoteFeed = s_syntheticPriceFeeds[quoteCurrency];

        if (q == USD) {
            if (baseFeed == address(0)) revert ForexEngine__InvalidBaseFeed();
            return _price1e18(baseFeed); // base/USD in 1e18
        }
        if (b == USD) {
            if (quoteFeed == address(0)) revert ForexEngine__InvalidQuoteFeed();
            return _price1e18(quoteFeed); // quote/USD in 1e18
        }

        if (baseFeed == address(0) || quoteFeed == address(0))
            revert ForexEngine__InvalidFeeds();
        uint256 baseUsd1e18 = _price1e18(baseFeed);
        uint256 quoteUsd1e18 = _price1e18(quoteFeed);
        return (baseUsd1e18 * PRECISION) / quoteUsd1e18; // base/quote in 1e18
    }

    function getSyntheticTokenAddress(
        string memory symbol
    ) external view returns (address) {
        return s_syntheticTokens[symbol];
    }

    function getSyntheticPriceFeed(
        string memory symbol
    ) external view returns (address) {
        return s_syntheticPriceFeeds[symbol];
    }

    function getCollateralBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return s_collateralDeposited[user][token];
    }

    function getTokenConfig(
        string memory symbol
    ) external view returns (TokenConfig memory) {
        return s_tokenConfig[symbol];
    }

    function getPriceFeed(address token) external view returns (address) {
        return s_priceFeeds[token];
    }

    function getCollateralTokens() external view returns (address[] memory) {
        return s_collateralTokens;
    }

    function getProtocolReserveWallet() external view returns (address) {
        return s_protocolReserve;
    }

    function getTotalProtocolPnl() external view onlyOwner returns (int256) {
        return s_totalProtocolPnl;
    }

    function getRealizedPnl(address user) external view returns (int256) {
        return s_realizedPnl[user];
    }

    function getAllUserPositions(
        address user
    ) external view returns (Position[] memory) {
        return s_userPositions[user];
    }

    function getOpenPositionIds(
        address user,
        string calldata pair
    ) external view returns (uint256[] memory) {
        return s_openPositionIds[user][pair];
    }

    // Exposed for UI
    function getOpenPositionCount(
        address user
    ) external view returns (uint256) {
        return s_openPositionCount[user];
    }

    // ---- Internal tracking helpers ----

    function _trackOpenPosition(
        address user,
        string memory pair,
        uint256 id
    ) internal {
        s_openPosIndex[user][pair][id] = s_openPositionIds[user][pair].length;
        s_openPositionIds[user][pair].push(id);
    }

    function _untrackOpenPosition(
        address user,
        string memory pair,
        uint256 id
    ) internal {
        uint256[] storage arr = s_openPositionIds[user][pair];
        if (arr.length == 0) return;

        uint256 idx = s_openPosIndex[user][pair][id];
        if (idx >= arr.length) return;

        uint256 lastId = arr[arr.length - 1];
        arr[idx] = lastId;
        s_openPosIndex[user][pair][lastId] = idx;
        arr.pop();

        delete s_openPosIndex[user][pair][id];
    }

    // --- Safe normalization --- //
    function _normalizePrice1e18(
        int32 /*unused*/,
        uint8 /*unused*/
    ) internal pure returns (uint256) {
        revert();
    } // stub to keep selector slots tidy (won't be called)

    function _normalizePrice1e18(
        int256 price,
        uint8 priceDecimals
    ) internal pure returns (uint256) {
        if (price <= 0) revert ForexEngine__InvalidPrice();
        return (uint256(price) * PRECISION) / (10 ** priceDecimals);
    }

    function _normalizeAmount1e18(
        uint256 amt,
        uint8 tokenDecimals
    ) internal pure returns (uint256) {
        return (amt * PRECISION) / (10 ** tokenDecimals);
    }

    function _usdFromToken(
        uint256 amount,
        uint8 tokenDecimals,
        int256 price,
        uint8 priceDecimals
    ) internal pure returns (uint256) {
        uint256 p1e18 = _normalizePrice1e18(price, priceDecimals);
        uint256 a1e18 = _normalizeAmount1e18(amount, tokenDecimals);
        return (a1e18 * p1e18) / PRECISION; // USD 1e18
    }

    // Strict USD conversion (reverts on stale/invalid)
    function _convertToUSD(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[token]
        );
        (, int256 price, , uint256 updatedAt, ) = priceFeed.latestRoundData();
        _validatePrice(price, updatedAt);

        uint8 tokenDecimals = ERC20(token).decimals();
        uint8 priceDecimals = priceFeed.decimals();

        return _usdFromToken(amount, tokenDecimals, price, priceDecimals);
    }

    function _getTotalCollateralValue(
        address user
    ) internal view returns (uint256 totalValue) {
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            address token = s_collateralTokens[i];
            uint256 amount = s_collateralDeposited[user][token];
            if (amount == 0) continue;
            totalValue = totalValue + _convertToUSD(token, amount);
        }
    }

    // ---- Choose base collateral dynamically (prefer WETH if set) ----
    function _baseCollateral() internal view returns (address) {
        if (s_weth != address(0)) return s_weth;
        if (s_collateralTokens.length == 0)
            revert ForexEngine__NoCollateralTokens();
        return s_collateralTokens[0];
    }

    /// Accept ETH for WETH unwraps
    receive() external payable {}
}
