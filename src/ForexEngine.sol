// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {SyntheticUSD} from "./SyntheticUSD.sol";
import {SyntheticEUR} from "./SyntheticEUR.sol";
import {SyntheticGBP} from "./SyntheticGBP.sol";
import {SyntheticJPY} from "./SyntheticJPY.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import "../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {OracleLib} from "./libraries/OracleLib.sol";
import {ISyntheticToken} from "./interfaces/ISyntheticToken.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {TokenConfig} from "./TokenConfig.sol";

contract ForexEngine is ReentrancyGuard, Ownable {
    error ForexEngine__NeedsMoreThanZero();
    error ForexEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength();
    error ForexEngine__SyntheticSymbolsAndAddressesMustMatchLength();
    error ForexEngine__NotAllowedToken();
    error ForexEngine__TransferFailed();
    error ForexEngine__MintFailed();
    error ForexEngine__NotAllowedZeroAddress();
    error ForexEngine__InvalidSyntheticSymbol();

    using OracleLib for AggregatorV3Interface;

    uint256 private constant ADDITIONAL_FEED_PRECISION = 1e10;
    uint256 private constant PRECISION = 1e18;

    uint256 public constant MAX_LEVERAGE = 5; // Max leverage: 5x
    uint256 public constant MIN_MARGIN_PERCENT = 30; // 30% must be reserved
    int256 private s_totalProtocolPnl;
    mapping(address => address) private s_priceFeeds; // collateral token => price feed
    address[] private s_collateralTokens;

    mapping(address => mapping(address => uint256))
        private s_collateralDeposited;
    mapping(string => address) private s_syntheticTokens;
    mapping(string => address) private s_syntheticPriceFeeds;

    mapping(address => uint256) private s_marginUsed;

    address[] private s_traderAddresses;
    mapping(address => bool) private s_isTrader;

    address private s_protocolReserve;
    // user => pair => exposure in synthetic tokens (tradeSize)
    mapping(address => mapping(string => uint256))
        public s_userSyntheticExposure;

    string[] private s_syntheticSymbols;

    struct Position {
        address user;
        string pair;
        bool isLong;
        uint256 entryPrice;
        uint256 marginUsed;
        uint256 leverage;
        uint256 tradeSize;
        uint256 timestamp; // open time
        bool isOpen;
        uint256 exitPrice;
        int256 pnl;
        uint256 closeTimestamp;
        uint256 takeProfitPrice;
        uint256 stopLossPrice;
    }

    mapping(string => TokenConfig) public s_tokenConfig;
    mapping(address => Position[]) private s_userPositions;
    mapping(address => int256) private s_realizedPnl;

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
        uint256 tradeSize,
        uint256 entryPrice
    );
    event PositionClosed(
        address indexed user,
        string pair,
        bool isLong,
        uint256 marginUsed,
        uint256 tradeSize,
        uint256 entryPrice,
        uint256 exitPrice,
        int256 pnl,
        uint256 timestamp
    );
    event ProtocolReserveSet(
        address indexed oldReserve,
        address indexed newReserve
    );
    event DebugAmount(uint256 amount);
    event ProtocolProfitTaken(address indexed user, uint256 amount);
    event ProtocolLossCovered(address indexed user, uint256 amount);
    event UserLiquidated(address indexed user, uint256 timestamp);

    modifier moreThanZero(uint256 amount) {
        if (amount == 0) revert ForexEngine__NeedsMoreThanZero();
        emit DebugAmount(amount);
        _;
    }

    modifier isAllowedToken(address token) {
        if (s_priceFeeds[token] == address(0))
            revert ForexEngine__NotAllowedToken();
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
            s_priceFeeds[tokenAddresses[i]] = priceFeedAddresses[i];
            s_collateralTokens.push(tokenAddresses[i]);
        }

        for (uint256 j = 0; j < syntheticSymbols.length; j++) {
            string memory symbol = syntheticSymbols[j];
            s_syntheticTokens[symbol] = syntheticTokenAddresses[j];
            s_tokenConfig[symbol] = syntheticConfigs[j];
            s_syntheticPriceFeeds[symbol] = syntheticPriceFeeds[j];
            s_syntheticSymbols.push(symbol); // Add symbol to the dynamic list
        }
    }

    function setSyntheticPriceFeed(
        string memory symbol,
        address newFeed
    ) external onlyOwner {
        if (bytes(symbol).length == 0 || newFeed == address(0)) {
            revert ForexEngine__NotAllowedZeroAddress();
        }
        s_syntheticPriceFeeds[symbol] = newFeed;
    }

    function setCollateralToken(
        address token,
        address priceFeed
    ) external onlyOwner {
        if (token == address(0) || priceFeed == address(0)) {
            revert ForexEngine__NotAllowedZeroAddress();
        }
        s_priceFeeds[token] = priceFeed;

        // Add token to the array only if it's not already there
        bool exists = false;
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            if (s_collateralTokens[i] == token) {
                exists = true;
                break;
            }
        }

        if (!exists) {
            s_collateralTokens.push(token);
        }
    }

    function setProtocolReserveWallet(address newReserve) external onlyOwner {
        if (newReserve == address(0))
            revert ForexEngine__NotAllowedZeroAddress();
        address old = s_protocolReserve;
        s_protocolReserve = newReserve;
        emit ProtocolReserveSet(old, newReserve);
    }

    function getProtocolReserveWallet() external view returns (address) {
        return s_protocolReserve;
    }

    function openPosition(
        string memory pair,
        bool isLong,
        uint256 marginAmount,
        uint256 leverage,
        uint256 takeProfitPrice,
        uint256 stopLossPrice
    ) external nonReentrant {
        checkAndLiquidate(msg.sender);

        // Input validation
        if (leverage == 0 || leverage > MAX_LEVERAGE)
            revert("Invalid leverage");
        if (marginAmount == 0) revert("Margin must be > 0");

        // Get user's collateral in the margin token
        address marginToken = s_collateralTokens[0];
        uint256 marginTokenBalance = s_collateralDeposited[msg.sender][
            marginToken
        ];
        if (marginTokenBalance < marginAmount) {
            revert("Insufficient margin token balance");
        }

        // Calculate total collateral value in USD
        uint256 totalCollateralValueUSD;
        address[] memory tokens = s_collateralTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = s_collateralDeposited[msg.sender][tokens[i]];
            if (amount == 0) continue;

            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                s_priceFeeds[tokens[i]]
            );
            (, int256 collateralPrice, , , ) = priceFeed.latestRoundData();

            uint8 tokenDecimals = ERC20(tokens[i]).decimals();
            uint8 priceDecimals = priceFeed.decimals();

            // Convert to 18-decimal USD value
            uint256 collateralValueUSD = ((uint256(collateralPrice) *
                amount *
                (10 ** (18 - priceDecimals))) / (10 ** tokenDecimals));

            totalCollateralValueUSD += collateralValueUSD;
        }

        // Get margin token price data
        AggregatorV3Interface marginPriceFeed = AggregatorV3Interface(
            s_priceFeeds[marginToken]
        );
        (, int256 marginTokenPrice, , , ) = marginPriceFeed.latestRoundData();
        uint8 marginTokenDecimals = ERC20(marginToken).decimals();
        uint8 marginPriceDecimals = marginPriceFeed.decimals();

        // Convert marginAmount to USD
        uint256 marginAmountUSD = (uint256(marginTokenPrice) *
            marginAmount *
            (10 ** (18 - marginPriceDecimals))) / (10 ** marginTokenDecimals);

        // Check available margin
        uint256 usedMarginUSD = s_marginUsed[msg.sender];
        uint256 availableMarginUSD = totalCollateralValueUSD - usedMarginUSD;

        if (availableMarginUSD < marginAmountUSD) {
            revert("Insufficient available margin");
        }

        // Validate synthetic asset
        address feedAddr = s_syntheticPriceFeeds[pair];
        if (feedAddr == address(0)) {
            revert ForexEngine__InvalidSyntheticSymbol();
        }
        AggregatorV3Interface feed = AggregatorV3Interface(feedAddr);
        (, int256 entryPrice, , , ) = feed.latestRoundData();

        // Calculate trade size
        uint256 tradeSize = marginAmount * leverage;

        // Verify synthetic token exists
        address sToken = s_syntheticTokens[pair];
        if (sToken == address(0)) {
            revert ForexEngine__InvalidSyntheticSymbol();
        }

        // Create position
        ISyntheticToken(sToken).mint(address(this), tradeSize);
        s_userSyntheticExposure[msg.sender][pair] += tradeSize;

        s_userPositions[msg.sender].push(
            Position({
                user: msg.sender,
                pair: pair,
                isLong: isLong,
                entryPrice: uint256(entryPrice),
                marginUsed: marginAmount,
                leverage: leverage,
                tradeSize: tradeSize,
                timestamp: block.timestamp,
                isOpen: true,
                exitPrice: 0,
                pnl: 0,
                closeTimestamp: 0,
                takeProfitPrice: takeProfitPrice,
                stopLossPrice: stopLossPrice
            })
        );

        // Update used margin
        s_marginUsed[msg.sender] += marginAmountUSD;

        emit PositionOpened(
            msg.sender,
            pair,
            isLong,
            marginAmount,
            leverage,
            tradeSize,
            uint256(entryPrice)
        );
    }

    function closePosition(uint256 index) external nonReentrant {
        checkAndLiquidate(msg.sender);
        require(index < s_userPositions[msg.sender].length, "Invalid index");
        Position storage position = s_userPositions[msg.sender][index];
        require(position.isOpen, "Position already closed");

        address feedAddr = s_syntheticPriceFeeds[position.pair];
        if (feedAddr == address(0))
            revert ForexEngine__InvalidSyntheticSymbol();

        AggregatorV3Interface feed = AggregatorV3Interface(feedAddr);
        (, int256 exitPriceRaw, , , ) = feed.latestRoundData();
        uint256 exitPrice = uint256(exitPriceRaw);

        int256 pnl = position.isLong
            ? (int256(position.tradeSize) *
                (int256(exitPrice) - int256(position.entryPrice))) /
                int256(position.entryPrice)
            : (int256(position.tradeSize) *
                (int256(position.entryPrice) - int256(exitPrice))) /
                int256(position.entryPrice);

        // Burn synthetic tokens (realism)
        address sToken = s_syntheticTokens[position.pair];
        if (sToken == address(0)) revert ForexEngine__InvalidSyntheticSymbol();
        ISyntheticToken(sToken).burn(position.tradeSize);
        s_userSyntheticExposure[msg.sender][position.pair] -= position
            .tradeSize;

        // 🟡 Fix: Convert marginUsed (WETH) → USD and subtract
        address baseToken = s_collateralTokens[0];
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[baseToken]
        );
        (, int256 priceRaw, , , ) = priceFeed.latestRoundData();
        uint8 tokenDecimals = ERC20(baseToken).decimals();
        uint8 priceDecimals = priceFeed.decimals();

        uint256 marginUSD = (uint256(priceRaw) *
            position.marginUsed *
            (10 ** (18 - priceDecimals))) / (10 ** tokenDecimals);
        s_marginUsed[msg.sender] -= marginUSD;

        if (pnl >= 0) {
            // Profit: send from reserve wallet
            require(s_protocolReserve != address(0), "Reserve not set");
            bool success = IERC20(baseToken).transferFrom(
                s_protocolReserve,
                address(this),
                uint256(pnl)
            );
            if (!success) revert ForexEngine__TransferFailed();
            s_collateralDeposited[msg.sender][baseToken] += uint256(pnl);

            emit ProtocolLossCovered(msg.sender, uint256(pnl));
        } else {
            // Loss: subtract from user and record as protocol profit
            uint256 loss = uint256(-pnl);
            uint256 userBalance = s_collateralDeposited[msg.sender][baseToken];
            if (loss > userBalance) loss = userBalance;
            s_collateralDeposited[msg.sender][baseToken] -= loss;
            IERC20(baseToken).transfer(s_protocolReserve, loss);

            emit ProtocolProfitTaken(msg.sender, loss);
        }

        position.exitPrice = exitPrice;
        position.pnl = pnl;
        position.closeTimestamp = block.timestamp;
        position.isOpen = false;

        // Track unique traders
        if (!s_isTrader[msg.sender]) {
            s_isTrader[msg.sender] = true;
            s_traderAddresses.push(msg.sender);
        }

        // Accumulate realized PnL
        s_realizedPnl[msg.sender] += pnl;

        // Update total protocol PnL
        s_totalProtocolPnl -= pnl;

        emit PositionClosed(
            msg.sender,
            position.pair,
            position.isLong,
            position.marginUsed,
            position.tradeSize,
            position.entryPrice,
            exitPrice,
            pnl,
            block.timestamp
        );
    }

    function mintSyntheticToken(
        string memory symbol,
        uint256 amount
    ) external moreThanZero(amount) nonReentrant {
        address token = s_syntheticTokens[symbol];
        if (token == address(0)) revert ForexEngine__InvalidSyntheticSymbol();
        ISyntheticToken(token).mint(msg.sender, amount);
    }

    function burnSyntheticToken(
        string memory symbol,
        uint256 amount
    ) external moreThanZero(amount) nonReentrant {
        address token = s_syntheticTokens[symbol];
        if (token == address(0)) revert ForexEngine__InvalidSyntheticSymbol();

        bool success = IERC20(token).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        if (!success) revert ForexEngine__TransferFailed();

        ISyntheticToken(token).burn(amount);
    }

    function depositCollateral(
        address token,
        uint256 amount
    ) external moreThanZero(amount) isAllowedToken(token) nonReentrant {
        s_collateralDeposited[msg.sender][token] += amount;
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
    ) external moreThanZero(amount) nonReentrant {
        s_collateralDeposited[msg.sender][token] -= amount;
        emit CollateralRedeemed(msg.sender, msg.sender, token, amount);

        bool success = IERC20(token).transfer(msg.sender, amount);
        if (!success) revert ForexEngine__TransferFailed();
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

    function getUserPositionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        Position[] memory all = s_userPositions[user];
        uint256 total = all.length;

        if (offset >= total) {
            // Return an empty array
            Position[] memory emptyArray = new Position[](0);
            return emptyArray;
        }

        uint256 end = offset + limit;
        if (end > total) end = total;

        Position[] memory result = new Position[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            result[i - offset] = all[i];
        }

        return result;
    }

    function getOpenPositions(
        address user
    ) external view returns (Position[] memory) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        Position[] memory all = s_userPositions[user];

        // Count open positions
        uint256 openCount = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].isOpen) openCount++;
        }

        // Copy only open positions
        Position[] memory openPositions = new Position[](openCount);
        uint256 j = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].isOpen) {
                openPositions[j] = all[i];
                j++;
            }
        }

        return openPositions;
    }

    function getReserveBalance() external view onlyOwner returns (uint256) {
        return address(this).balance;
    }

    function getRealizedPnl(address user) external view returns (int256) {
        return s_realizedPnl[user];
    }

    function getClosedPositionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        Position[] memory all = s_userPositions[user];

        // First count closed positions
        uint256 totalClosed = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (!all[i].isOpen) totalClosed++;
        }

        if (offset >= totalClosed) {
            // Return an empty array instead of new Position
            Position[] memory emptyArray = new Position[](0);
            return emptyArray;
        }

        uint256 end = offset + limit;
        if (end > totalClosed) end = totalClosed;

        Position[] memory result = new Position[](end - offset);
        uint256 j = 0;
        uint256 k = 0;
        for (uint256 i = 0; i < all.length && k < end; i++) {
            if (!all[i].isOpen) {
                if (k >= offset) {
                    result[j] = all[i];
                    j++;
                }
                k++;
            }
        }

        return result;
    }

    function getLeaderboard()
        external
        view
        onlyOwner
        returns (address[] memory, int256[] memory)
    {
        uint256 count = s_traderAddresses.length;
        address[] memory traders = new address[](count);
        int256[] memory pnls = new int256[](count);

        for (uint256 i = 0; i < count; i++) {
            address trader = s_traderAddresses[i];
            traders[i] = trader;
            pnls[i] = s_realizedPnl[trader];
        }

        return (traders, pnls);
    }

    function getUserSyntheticExposures(
        address user
    )
        external
        view
        returns (string[] memory symbols, uint256[] memory exposures)
    {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        uint256 count = s_syntheticSymbols.length;
        symbols = new string[](count);
        exposures = new uint256[](count);

        for (uint256 i = 0; i < count; i++) {
            string memory symbol = s_syntheticSymbols[i];
            symbols[i] = symbol;
            exposures[i] = s_userSyntheticExposure[user][symbol];
        }
    }

    function getLastPosition(
        address user
    ) external view returns (Position memory) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        uint256 len = s_userPositions[user].length;
        require(len > 0, "No trades yet");
        return s_userPositions[user][len - 1];
    }

    function getOpenPositionsPaginated(
        address user,
        uint256 offset,
        uint256 limit
    ) external view returns (Position[] memory) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");

        Position[] memory all = s_userPositions[user];

        // Count open positions
        uint256 totalOpen = 0;
        for (uint256 i = 0; i < all.length; i++) {
            if (all[i].isOpen) totalOpen++;
        }

        if (offset >= totalOpen) {
            // Return an empty array
            Position[] memory emptyArray = new Position[](0);
            return emptyArray;
        }

        uint256 end = offset + limit;
        if (end > totalOpen) end = totalOpen;

        Position[] memory result = new Position[](end - offset);
        uint256 j = 0;
        uint256 k = 0;
        for (uint256 i = 0; i < all.length && k < end; i++) {
            if (all[i].isOpen) {
                if (k >= offset) {
                    result[j] = all[i];
                    j++;
                }
                k++;
            }
        }

        return result;
    }

    function getTotalPositions(address user) external view returns (uint256) {
        require(msg.sender == user || msg.sender == owner(), "Not authorized");
        return s_userPositions[user].length;
    }

    function getAllOpenPositions()
        external
        view
        onlyOwner
        returns (Position[] memory)
    {
        uint256 totalCount = 0;

        // First pass: count total open positions
        for (uint256 i = 0; i < s_traderAddresses.length; i++) {
            Position[] memory positions = s_userPositions[s_traderAddresses[i]];
            for (uint256 j = 0; j < positions.length; j++) {
                if (positions[j].isOpen) totalCount++;
            }
        }

        Position[] memory allOpen = new Position[](totalCount);
        uint256 index = 0;

        // Second pass: populate the array
        for (uint256 i = 0; i < s_traderAddresses.length; i++) {
            Position[] memory positions = s_userPositions[s_traderAddresses[i]];
            for (uint256 j = 0; j < positions.length; j++) {
                if (positions[j].isOpen) {
                    allOpen[index] = positions[j];
                    index++;
                }
            }
        }

        return allOpen;
    }

    function getTotalProtocolPnl() external view onlyOwner returns (int256) {
        return s_totalProtocolPnl;
    }

    function getUserCollateralValue(
        address user
    ) external view returns (uint256 usdValue) {
        address[] memory tokens = s_collateralTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = s_collateralDeposited[user][tokens[i]];
            if (amount == 0) continue;

            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                s_priceFeeds[tokens[i]]
            );
            (, int256 price, , , ) = priceFeed.latestRoundData();

            uint8 tokenDecimals = ERC20Mock(tokens[i]).decimals();
            uint8 priceDecimals = priceFeed.decimals();

            // Convert amount * price to 18-decimal USD
            uint256 adjusted = (uint256(price) * amount * 1e18) /
                (10 ** tokenDecimals) /
                (10 ** priceDecimals);

            usdValue += adjusted;
        }
    }

    function getUserMarginRatio(
        address user
    ) public view returns (uint256 marginRatioBps) {
        // Calculate total collateral value in USD
        uint256 totalCollateralUsd = 0;
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            address token = s_collateralTokens[i];
            uint256 balance = s_collateralDeposited[user][token];
            if (balance == 0) continue;

            (, int256 priceRaw, , , ) = AggregatorV3Interface(
                s_priceFeeds[token]
            ).latestRoundData();
            uint8 tokenDecimals = ERC20(token).decimals();
            uint8 priceFeedDecimals = AggregatorV3Interface(s_priceFeeds[token])
                .decimals();

            uint256 price = uint256(priceRaw);
            uint256 tokenValueUsd = (balance * price * 1e18) /
                (10 ** tokenDecimals) /
                (10 ** priceFeedDecimals);
            totalCollateralUsd += tokenValueUsd;
        }

        // Calculate unrealized PnL from open positions
        int256 totalUnrealizedPnl = 0;
        Position[] memory positions = s_userPositions[user];
        for (uint256 i = 0; i < positions.length; i++) {
            if (!positions[i].isOpen) continue;

            (, int256 latestPriceRaw, , , ) = AggregatorV3Interface(
                s_syntheticPriceFeeds[positions[i].pair]
            ).latestRoundData();
            uint256 currentPrice = uint256(latestPriceRaw);
            uint256 entryPrice = positions[i].entryPrice;
            uint256 size = positions[i].tradeSize;

            if (positions[i].isLong) {
                totalUnrealizedPnl +=
                    (int256(size) *
                        (int256(currentPrice) - int256(entryPrice))) /
                    int256(entryPrice);
            } else {
                totalUnrealizedPnl +=
                    (int256(size) *
                        (int256(entryPrice) - int256(currentPrice))) /
                    int256(entryPrice);
            }
        }

        uint256 marginUsed = s_marginUsed[user];
        if (marginUsed == 0) {
            return 10000; // ✅ Return 100% margin ratio for frontend if no positions open
        }

        // Calculate equity (collateral + PnL)
        int256 equity = int256(totalCollateralUsd) + totalUnrealizedPnl;
        if (equity <= 0) {
            return 0; // Completely underwater
        }

        // Return margin ratio in basis points (e.g., 3000 = 30%)
        marginRatioBps = uint256((equity * 1e4) / int256(marginUsed));
    }

    function checkAndLiquidate(address user) public {
        uint256 marginRatioBps = getUserMarginRatio(user);

        if (marginRatioBps >= MIN_MARGIN_PERCENT * 100) {
            return; // User is healthy, no liquidation needed
        }

        Position[] storage positions = s_userPositions[user];
        uint256 len = positions.length;

        for (uint256 i = 0; i < len; i++) {
            if (positions[i].isOpen) {
                _forceClosePosition(user, i);
            }
        }

        emit UserLiquidated(user, block.timestamp);
    }

    function _forceClosePosition(address user, uint256 index) internal {
        require(index < s_userPositions[user].length, "Invalid index");
        Position storage position = s_userPositions[user][index];
        if (!position.isOpen) return;

        address feedAddr = s_syntheticPriceFeeds[position.pair];
        if (feedAddr == address(0))
            revert ForexEngine__InvalidSyntheticSymbol();

        (, int256 exitPriceRaw, , , ) = AggregatorV3Interface(feedAddr)
            .latestRoundData();
        uint256 exitPrice = uint256(exitPriceRaw);

        int256 pnl = position.isLong
            ? (int256(position.tradeSize) *
                (int256(exitPrice) - int256(position.entryPrice))) /
                int256(position.entryPrice)
            : (int256(position.tradeSize) *
                (int256(position.entryPrice) - int256(exitPrice))) /
                int256(position.entryPrice);

        // Burn synthetic tokens
        address sToken = s_syntheticTokens[position.pair];
        if (sToken == address(0)) revert ForexEngine__InvalidSyntheticSymbol();
        ISyntheticToken(sToken).burn(position.tradeSize);
        s_userSyntheticExposure[user][position.pair] -= position.tradeSize;
        s_marginUsed[user] -= position.marginUsed;

        address baseToken = s_collateralTokens[0];

        if (pnl >= 0) {
            require(s_protocolReserve != address(0), "Reserve not set");
            bool success = IERC20(baseToken).transferFrom(
                s_protocolReserve,
                address(this),
                uint256(pnl)
            );
            if (!success) revert ForexEngine__TransferFailed();
            s_collateralDeposited[user][baseToken] += uint256(pnl);
            emit ProtocolLossCovered(user, uint256(pnl));
        } else {
            uint256 loss = uint256(-pnl);
            uint256 userBalance = s_collateralDeposited[user][baseToken];
            if (loss > userBalance) loss = userBalance;
            s_collateralDeposited[user][baseToken] -= loss;
            IERC20(baseToken).transfer(s_protocolReserve, loss);
            emit ProtocolProfitTaken(user, loss);
        }

        position.exitPrice = exitPrice;
        position.pnl = pnl;
        position.closeTimestamp = block.timestamp;
        position.isOpen = false;

        if (!s_isTrader[user]) {
            s_isTrader[user] = true;
            s_traderAddresses.push(user);
        }

        s_realizedPnl[user] += pnl;

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
    }

    function getTotalCollateral(
        address user
    ) public view returns (uint256 totalCollateral) {
        address[] memory tokens = s_collateralTokens;

        for (uint256 i = 0; i < tokens.length; i++) {
            uint256 amount = s_collateralDeposited[user][tokens[i]];
            if (amount == 0) continue;

            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                s_priceFeeds[tokens[i]]
            );
            (, int256 price, , , ) = priceFeed.latestRoundData();

            uint8 decimals = ERC20Mock(tokens[i]).decimals();
            totalCollateral += (uint256(price) * amount) / (10 ** decimals);
        }
    }

    function getUsedMargin(address user) public view returns (uint256) {
        return s_marginUsed[user];
    }

    // Add to ForexEngine.sol
    function getCollateralValueInUSD(
        address user,
        address token
    ) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[token]
        );
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint8 decimals = ERC20(token).decimals();
        uint256 balance = s_collateralDeposited[user][token];
        return (balance * uint256(price)) / (10 ** decimals);
    }

    function calculateRequiredCollateral(
        uint256 marginUSD, // Should be in 18 decimals (1e18 = $1)
        address collateralToken
    ) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(
            s_priceFeeds[collateralToken]
        );
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint8 decimals = ERC20(collateralToken).decimals();
        return (marginUSD * (10 ** decimals)) / uint256(price);
    }

    function getDerivedPrice(
        string memory base,
        string memory quote
    ) public view returns (uint256) {
        // 1. Get price feeds
        address baseFeed = s_syntheticPriceFeeds[base];
        address quoteFeed = s_syntheticPriceFeeds[quote];
        require(
            baseFeed != address(0) && quoteFeed != address(0),
            "Feed not set"
        );

        // 2. Fetch latest prices
        (, int256 basePrice, , uint256 baseUpdatedAt, ) = AggregatorV3Interface(
            baseFeed
        ).latestRoundData();
        (
            ,
            int256 quotePrice,
            ,
            uint256 quoteUpdatedAt,

        ) = AggregatorV3Interface(quoteFeed).latestRoundData();

        // 3. Validate prices
        require(basePrice > 0 && quotePrice > 0, "Invalid price");
        require(block.timestamp - baseUpdatedAt <= 2 hours, "Stale base price");
        require(
            block.timestamp - quoteUpdatedAt <= 2 hours,
            "Stale quote price"
        );

        // 4. Normalize decimals (to 18)
        uint8 baseDecimals = AggregatorV3Interface(baseFeed).decimals();
        uint8 quoteDecimals = AggregatorV3Interface(quoteFeed).decimals();
        uint256 baseScaled = uint256(basePrice) * (10 ** (18 - baseDecimals));
        uint256 quoteScaled = uint256(quotePrice) *
            (10 ** (18 - quoteDecimals));

        // 5. Calculate ratio with precision
        return (baseScaled * 1e18) / quoteScaled; // (base/quote) in 18 decimals
    }
}
