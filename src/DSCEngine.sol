// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {DecentralizedStableCoin} from "./DecentralizedStableCoin.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
//import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

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

    //State variables
    uint256 private constant ADDITIONAL_FEED_PRECISION = 1e10;
    uint256 private constant PRECISION = 1e18;
    uint256 private constant LIQUIDATION_THRESHOLD = 50; //means 200% overcollateralized
    uint256 private constant LIQUIDATION_PRECISION = 100;     
    uint256 private constant MIN_HEALTH_FACTOR = 1e18;
    uint256 private constant FEED_PRECISION = 1e8;


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


    modifier moreThanZero(uint256 amount) {
        if (amount == 0) {
            revert DSCEngine__NeedsMoreThanZero();
        }
        _;
    }

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

    function depositCollateralAndMintDsc() external {}

    function depositCollateral(address tokenCollateralAddress, uint256 amountCollateral)
        external
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

    function redeemCollateralForDsc() external {}
    function redeemCollateral() external {}

    function mintDsc(uint256 amountDscToMint) external moreThanZero(amountDscToMint) nonReentrant() {
        s_DSCMinted[msg.sender] += amountDscToMint;
        //if they minted too much eg $150 DSC vs $100 ETH
        _revertIfHealthFactorIsBroken(msg.sender);
        bool minted = i_dsc.mint(msg.sender, amountDscToMint);
        if (!minted) {
            revert DSCEngine__MintFailed();
        }
    }

    
    
    function burnDsc() external {}
    function liquidate() external {}
    function getHealthFactor() external view {}

    //Private and Internal view functions:
        
    function _getAccountInformation(address user) private view returns(
        uint256 totalDscMinted,
        uint256 collateralValueInUsd)
    {
        totalDscMinted = s_DSCMinted[user];
        collateralValueInUsd = getAccountCollateralValue(user);
    }

    // _healthFactor returns how close the user is to liquidation
    // if a user goes below 1, they can be liquidated   
    function _healthFactor(address user) private view returns(uint256) {
        //total DSC minted & total collateral value
    (uint256 totalDscMinted,uint256 collateralValueInUsd) = _getAccountInformation(user);
    uint256 collateralAdjustedForThreshold = (collateralValueInUsd * LIQUIDATION_THRESHOLD) / LIQUIDATION_PRECISION;
    return (collateralAdjustedForThreshold * PRECISION) / totalDscMinted;
    // $150 ETH / 100 DSC = 1.5
    // 150 *50 - 7500 / 100 = (75 / 100) < 1
    
    // $1000 ETH / 100 DSC
    // 1000 * 50 = 50000 / 100 = (500 / 100) > 1
    }

    //check health factor ie do they have enough collateral?
    //revert if they don't
    function _revertIfHealthFactorIsBroken(address user) internal view {
    
        uint256 userHealthFactor = _healthFactor(user);
        if (userHealthFactor < MIN_HEALTH_FACTOR){ 
            revert DSCEngine__BreaksHealthFactor(userHealthFactor);
        }
    
    } 
    //Public and External view functions:
    function getAccountCollateralValue(address user) public view returns(uint256 totalCollateralValueInUse) {
        /** loop through each collateral token, get the amount they have deposited and 
        map it to the price to get the USD value */
        for (uint256 i = 0; i < s_collateralTokens.length; i++){
            address token = s_collateralTokens[i];
            uint256 amount = s_collateralDeposited[user][token];
            totalCollateralValueInUse += getUsdValue(token, amount);
        }
            return totalCollateralValueInUse;
    }

    function getUsdValue(address token, uint256 amount) public view returns (uint256){
        AggregatorV3Interface priceFeed = AggregatorV3Interface(s_priceFeeds[token]);
        (, int256 price,,,) = priceFeed.latestRoundData();
        // if 1 ETH = $1000
        // the returned value from ChainLink will be 1000 * 1e8 (8 decimals)
        // return` price * amount ? no 
        return ((uint256(price) * ADDITIONAL_FEED_PRECISION) * amount) / PRECISION;
    }

}
