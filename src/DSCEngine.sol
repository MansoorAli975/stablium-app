// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {DecentralizedStableCoin} from "./DecentralizedStableCoin.sol";

////import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
////import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

// import "../lib/openzeppelin-contracts/contracts/mocks/ERC20/Mock.sol";
// import "../lib/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol";

// import "@openzeppelin/contracts/mocks/ERC20/Mock.sol";
// import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Importing the ERC20 interface
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Importing the ReentrancyGuard
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Importing a mock ERC20 contract
import "@openzeppelin/contracts/mocks/ERC20Mock.sol"; // Use this if you want to mock ERC20

//import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {OracleLib} from "./libraries/OracleLib.sol";

/*
 * @title               DSCEngine
 * @author              Mansoor Ali
 * 
 * This system is designed to be as minimal as possible, 
 * and have the tokens maintain a 1 token == $1 peg
 * This stablecoin has the properties:
 * - Exogenous collateral
 * - Dollar Pegged
 * It is similar to DAI if DAI had no governance, no fees and was only backed by WETH and WBTC.
 * Our DSC system should always be "overcollateralized". At no point should the value of all collateral <= the $ backed value of all the DSC.

    @notice This contract is the core of DCS system. It handles all the logic for mining and redeeming DSC, as well as depositing & withdrawing collateral.
     @notice This contract is very loosely based on the MarkerDAO DSS (DAI) system
    
    (note to self: other one is RAI) 
*/
contract DSCEngine is ReentrancyGuard {
    error DSCEngine__NeedsMoreThanZero();
    error DSCEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength();
    error DSCEngine__NotAllowedToken();
    error DSCEngine__TransferFailed();
    error DSCEngine__BreaksHealthFactor(uint256 userHealthFactor);
    error DSCEngine__MintFailed();
    error DSCEngine__HealthFactorOk();
    error DSCEngine__HealthFactorNotImproved();
    error DSCEngine__NotAllowedZeroAddress();

    // TYPE//

    using OracleLib for AggregatorV3Interface;

    //State variables
    uint256 private constant ADDITIONAL_FEED_PRECISION = 1e10;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant LIQUIDATION_THRESHOLD = 50; //means 200% overcollateralized
    uint256 private constant LIQUIDATION_PRECISION = 100;
    uint256 private constant MIN_HEALTH_FACTOR = 1e18;
    uint256 private constant FEED_PRECISION = 1e8;
    uint256 private constant LIQUIDATION_BONUS = 10; //10% bonus

    //mapping (address => bool) private s_tokenToAllowed; not this time cuz gonna need pricefeed anyway
    mapping(address token => address priceFeed) private s_priceFeeds;
    mapping(address user => mapping(address token => uint256 amount)) private s_collateralDeposited;
    mapping(address user => uint256 amountDscMinted) private s_DSCMinted;
    address[] private s_collateralTokens;
    //address weth;
    //address wbtc;

    DecentralizedStableCoin private immutable i_dsc;

    //Events:
    event CollateralDeposited(address indexed user, address indexed token, uint256 amount);
    event CollateralRedeemed(
        address indexed redeemedFrom, address indexed redeemedTo, address indexed token, uint256 amount
    );

    // modifier moreThanZero(uint256 amount) {
    //     if (amount == 0) {
    //         revert DSCEngine__NeedsMoreThanZero();
    //     }
    //     _;
    // }

    modifier moreThanZero(uint256 amount) {
    if (amount == 0) {
        revert DSCEngine__NeedsMoreThanZero();
    }
    emit DebugAmount(amount); // Add a debug event for the amount
    _;
}
event DebugAmount(uint256 amount);


    modifier isAllowedToken(address token) {
        if (s_priceFeeds[token] == address(0)) {
            revert DSCEngine__NotAllowedToken();
        }
        _;
    }

    constructor(address[] memory tokenAddresses, address[] memory priceFeedAddresses, address dscAddress) {
        if (tokenAddresses.length != priceFeedAddresses.length) {
            revert DSCEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength();
        }

        for (uint256 i = 0; i < tokenAddresses.length; i++) {
            s_priceFeeds[tokenAddresses[i]] = priceFeedAddresses[i];
            s_collateralTokens.push(tokenAddresses[i]);
        }
        i_dsc = DecentralizedStableCoin(dscAddress);
    }

    //External Functions:

    /*
     *@param tokenCollateralAddress The address of token to deposit as collateral
     *@param amountCollateral The amount of collateral to deposit
     *@param amountDscToMint The amount of decentralized stablecoin to mint
     *@notice This function will deposit your collateral and mint DSC in one transaction
    */
    function depositCollateralAndMintDsc(
        address tokenCollateralAddress,
        uint256 amountCollateral,
        uint256 amountDscToMint
    ) external {
        depositCollateral(tokenCollateralAddress, amountCollateral);
        mintDsc(amountDscToMint);
    }

    function depositCollateral(address tokenCollateralAddress, uint256 amountCollateral)
        public
        moreThanZero(amountCollateral)
        isAllowedToken(tokenCollateralAddress)
        nonReentrant
    {
        s_collateralDeposited[msg.sender][tokenCollateralAddress] += amountCollateral;
        //emit s_collateralDeposited(msg.sender, tokenCollateralAddress, amountCollateral);
        emit CollateralDeposited(msg.sender, tokenCollateralAddress, amountCollateral); // Corrected by gpt
        bool success = IERC20(tokenCollateralAddress).transferFrom(msg.sender, address(this), amountCollateral);
        if (!success) {
            revert DSCEngine__TransferFailed();
        }
    }

    /*
    *@param tokenCollateralAddress The collateral address to redeem
    *@param amountCollateral The amount of collateral to redeem
    *@param amountDscToBurn The aount of DSC to burn
    *Thsi function burns DSC and redeems underlying collateral in one transaction
     */
    function redeemCollateralForDsc(address tokenCollateralAddress, uint256 amountCollateral, uint256 amountDscToBurn)
        external
    {
        burnDsc(amountDscToBurn);
        redeemCollateral(tokenCollateralAddress, amountCollateral);
        //redeemCollateral already checks health factor
    }

    // in order to redeem collateral:
    //1. health factor must be over one AFTER collateral is pulled
    function redeemCollateral(address tokenCollateralAddress, uint256 amountCollateral)
        public
        moreThanZero(amountCollateral)
        nonReentrant
    {
        _redeemCollateral(msg.sender, msg.sender, tokenCollateralAddress, amountCollateral);
        ///note to self try change order

        //_redeemCollateral(tokenCollateralAddress, amountCollateral, msg.sender, msg.sender);

        _revertIfHealthFactorIsBroken(msg.sender);
    }

    function mintDsc(uint256 amountDscToMint) public moreThanZero(amountDscToMint) nonReentrant {
        s_DSCMinted[msg.sender] += amountDscToMint;
        //if they minted too much eg $150 DSC vs $100 ETH
        _revertIfHealthFactorIsBroken(msg.sender);
        bool minted = i_dsc.mint(msg.sender, amountDscToMint);
        if (!minted) {
            revert DSCEngine__MintFailed();
        }
    }

    function burnDsc(uint256 amount) public moreThanZero(amount) {
        _burnDSC(amount, msg.sender, msg.sender);
        _revertIfHealthFactorIsBroken(msg.sender); //might not hit ever
    }

    //if we start nearing undercollateralization, we need some to liquidate positions
    // ie minted more than minimum collateral required
    // prie of ETH (collateral) tanks
    // if someone is almost undercollateralized, we will pay you to liquidate them
    //$75 backing $50 DSC, liquidator take $75 and burns off $50 DSC

    /*
     *@param collateral: The erc20 collateral address to loquidate from the user
     *@param user: The user who has broken the health factor. Their _healthFactor
     *              should be below MIN_HEALTH_FACTOR
     *@param debtToCover: The amount of DSC we want to burn to improve users' 
     *              health factor
     *@notice You can partially liquidate a user
     *@notice You will get a liquidation bonus for taking the users' funds
     *@notice This function working assumes the protocol will be roughly
     *          200% over collateralized in order for this to work
     *@notice A known bug would be if the protocol were 100% or less collateralized,   
     *         then we wouldn't be able to incentivize the liquidators
     *For exapmle, if the price of collateral plummeted before anyone could be 
     * liquidated.
     */
    function liquidate(address collateral, address user, uint256 debtToCover)
        external
        moreThanZero(debtToCover)
        nonReentrant
    {
        uint256 startingUserHealthFactor = _healthFactor(user);
        if (startingUserHealthFactor >= MIN_HEALTH_FACTOR) {
            revert DSCEngine__HealthFactorOk();
        }
        uint256 tokenAmountFromDebtCovered = getTokenAmountFromUsd(collateral, debtToCover);

        uint256 bonusCollateral = (tokenAmountFromDebtCovered * LIQUIDATION_BONUS) / LIQUIDATION_PRECISION;
        uint256 totalCollateralToRedeem = tokenAmountFromDebtCovered + bonusCollateral;
        _redeemCollateral(user, msg.sender, collateral, totalCollateralToRedeem);
        _burnDSC(debtToCover, user, msg.sender);

        uint256 endingUserHealthFactor = _healthFactor(user);
        if (endingUserHealthFactor <= startingUserHealthFactor) {
            revert DSCEngine__HealthFactorNotImproved();
        }
        _revertIfHealthFactorIsBroken(msg.sender);
    }

    function getHealthFactor() external view {}

    //Private and Internal view functions:

    /*
     *@dev Low-level internal function, do not call unless the function calling it is
     * checking for health factor being broken
     */
    function _burnDSC(uint256 amountDscToBurn, address onBehalfOf, address dscFrom) private {
        s_DSCMinted[onBehalfOf] -= amountDscToBurn;
        bool success = i_dsc.transferFrom(dscFrom, address(this), amountDscToBurn);

        if (!success) {
            revert DSCEngine__TransferFailed();
        }
        i_dsc.burn(amountDscToBurn);
    }

    function _redeemCollateral(address from, address to, address tokenCollateralAddress, uint256 amountCollateral)
        private
    {
        s_collateralDeposited[from][tokenCollateralAddress] -= amountCollateral;
        emit CollateralRedeemed(from, to, tokenCollateralAddress, amountCollateral);
        bool success = IERC20(tokenCollateralAddress).transfer(to, amountCollateral);
        if (!success) {
            revert DSCEngine__TransferFailed();
        }
        _revertIfHealthFactorIsBroken(msg.sender);
    }

    function _getAccountInformation(address user)
        private
        view
        returns (uint256 totalDscMinted, uint256 collateralValueInUsd)
    {
        totalDscMinted = s_DSCMinted[user];
        collateralValueInUsd = getAccountCollateralValue(user);
    }

    // _healthFactor returns how close the user is to liquidation
    // if a user goes below 1, they can be liquidated
    function _healthFactor(address user) private view returns (uint256) {
        //total DSC minted & total collateral value
        (uint256 totalDscMinted, uint256 collateralValueInUsd) = _getAccountInformation(user);

        return _calculateHealthFactor(totalDscMinted, collateralValueInUsd);

        //..refactored above..
        //uint256 collateralAdjustedForThreshold = (collateralValueInUsd * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
        //return (collateralAdjustedForThreshold * PRECISION) / totalDscMinted;

        // $150 ETH / 100 DSC = 1.5
        // 150 *50 - 7500 / 100 = (75 / 100) < 1

        // $1000 ETH / 100 DSC
        // 1000 * 50 = 50000 / 100 = (500 / 100) > 1
    }

    //check health factor ie do they have enough collateral?
    //revert if they don't
    function _revertIfHealthFactorIsBroken(address user) internal view {
        uint256 userHealthFactor = _healthFactor(user);
        
        if (userHealthFactor < MIN_HEALTH_FACTOR) {
            revert DSCEngine__BreaksHealthFactor(userHealthFactor);
        }
    }
    //Public and External view functions:

    function getTokenAmountFromUsd(address token, uint256 usdAmountInWei) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_priceFeeds[token]);
        (, int256 price,,,) = priceFeed.staleCheckLatestRoundData();
        return (usdAmountInWei * PRECISION) / (uint256(price) * ADDITIONAL_FEED_PRECISION);
    }

    function getAccountCollateralValue(address user) public view returns (uint256 totalCollateralValueInUse) {
        /*
         * Loop through each collateral token, get the amount they have deposited and
         *  map it to the price to get the USD value
         */
        for (uint256 i = 0; i < s_collateralTokens.length; i++) {
            address token = s_collateralTokens[i];
            uint256 amount = s_collateralDeposited[user][token];
            totalCollateralValueInUse += getUsdValue(token, amount);
        }
        return totalCollateralValueInUse;
    }

    function getUsdValue(address token, uint256 amount) public view returns (uint256) {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_priceFeeds[token]);
        (, int256 price,,,) = priceFeed.staleCheckLatestRoundData();
        // if 1 ETH = $1000
        // the returned value from ChainLink will be 1000 * 1e8 (8 decimals)
        // return` price * amount ? no
        return ((uint256(price) * ADDITIONAL_FEED_PRECISION) * amount) / PRECISION;
    }

    function _calculateHealthFactor(uint256 totalDscMinted, uint256 collateralValueInUsd)
        internal
        pure
        returns (uint256)
    {
        if (totalDscMinted == 0) return type(uint256).max;
        uint256 collateralAdjustedForThreshold = (collateralValueInUsd * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
        return (collateralAdjustedForThreshold * 1e18) / totalDscMinted;
    }

    //MORE EXTERNAL VIEW FUNCTIONS FOR BETTER VISIBILITY//

    function calculateHealthFactor(uint256 totalDscMinted, uint256 collateralValueInUsd)
        external
        pure
        returns (uint256)
    {
        return _calculateHealthFactor(totalDscMinted, collateralValueInUsd);
    }

    function getAccountInformation(address user)
        external
        view
        returns (uint256 totalDscMinted, uint256 collateralValueInUsd)
    {
        return _getAccountInformation(user);
    }
    ////
   //THIS WAS THE ORIGINAL FUNCTION, CHANGE TWICE BELOW BY CHATGPT///
    ///
    // function getCollateralBalanceOfUser(address user, address token) external view returns (uint256) {
    //     return s_collateralDeposited[user][token];
    // }

//     function getCollateralBalanceOfUser(address user, address token) external view returns (uint256) {
//     // Check if the user address is the zero address
//     if (user == address(0)) revert DSCEngine__NotAllowedZeroAddress();

//     // Ensure the token is a valid collateral token
//     if (!s_collateralTokens.contains(token)) revert DSCEngine__NotAllowedToken();

//     // Return the collateral balance for the given user and token
//     return s_collateralDeposited[user][token];
// }

    function getCollateralBalanceOfUser(address user, address token) external view returns (uint256) {
    // Check if the user address is the zero address
    if (user == address(0)) revert DSCEngine__NotAllowedZeroAddress();

    // Ensure the token is a valid collateral token
    bool isValidToken = false;
    for (uint256 i = 0; i < s_collateralTokens.length; i++) {
        if (s_collateralTokens[i] == token) {
            isValidToken = true;
            break;
        }
    }

    if (!isValidToken) revert DSCEngine__NotAllowedToken();

    // Return the collateral balance for the given user and token
    return s_collateralDeposited[user][token];
}

    function getPrecision() external pure returns (uint256) {
        return PRECISION;
    }

    function getAdditionalFeedPrecision() external pure returns (uint256) {
        return ADDITIONAL_FEED_PRECISION;
    }

    function getLiquidationThreshold() external pure returns (uint256) {
        return LIQUIDATION_THRESHOLD;
    }

    function getLiquidationBonus() external pure returns (uint256) {
        return LIQUIDATION_BONUS;
    }

    function getLiquidationPrecision() external pure returns (uint256) {
        return LIQUIDATION_PRECISION;
    }

    function getMinHealthFactor() external pure returns (uint256) {
        return MIN_HEALTH_FACTOR;
    }

    function getCollateralTokens() external view returns (address[] memory) {
        return s_collateralTokens;
    }

    function getDsc() external view returns (address) {
        return address(i_dsc);
    }

    function getCollateralTokenPriceFeed(address token) external view returns (address) {
        return s_priceFeeds[token];
    }

    function getHealthFactor(address user) external view returns (uint256) {
        return _healthFactor(user);
    }
}
