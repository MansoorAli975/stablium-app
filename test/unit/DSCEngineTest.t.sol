// // SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import {Test} from "forge-std/Test.sol";
import {DeployDSC} from "../../script/DeployDSC.s.sol";
import {DecentralizedStableCoin} from "../../src/DecentralizedStableCoin.sol";
import {DSCEngine} from "../../src/DSCEngine.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {MockV3Aggregator} from "../mocks/MockV3Aggregator.sol";
//import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20/Mock.sol";
//import "@openzeppelin/contracts/mocks/ERC20/Mock.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol"; // Correct import for the ERC20 mo

contract DSCEngineTest is Test {

DeployDSC deployer;
DecentralizedStableCoin dsc;
DSCEngine dsce; //engine
HelperConfig config;
address ethUsdPriceFeed;
address btcUsdPriceFeed;
address weth;
address public USER = makeAddr("user");
uint256 public constant AMOUNT_COLLATERAL = 10 ether;
uint256 public constant STARTING_ERC20_BALANCE = 10 ether;

function setUp() public {
deployer = new DeployDSC();
(dsc,dsce, config) = deployer.run();
(ethUsdPriceFeed, btcUsdPriceFeed, weth,,) = config.activeNetworkConfig();
ERC20Mock(weth).mint(USER, STARTING_ERC20_BALANCE );
}

//CONSTRUCTOR TESTS://

address[] public tokenAddresses;
address[] public priceFeedAddresses; 

function testRevertsIfTokenLengthDoesntMatchPriceFeeds() public {

tokenAddresses.push(weth);
priceFeedAddresses.push(ethUsdPriceFeed);
priceFeedAddresses.push(btcUsdPriceFeed);

vm.expectRevert(DSCEngine.DSCEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength.selector);
new DSCEngine(tokenAddresses, priceFeedAddresses, address(dsc));
}


//PRICE TESTS://

function testGetUsdValue() public view {

uint256 ethAmount = 15e18;
uint256 expectedUsd = 30000e18;
uint256 actualUsd = dsce.getUsdValue(weth, ethAmount);
assertEq(expectedUsd, actualUsd);

}

function testGetTokenAmountFromUsd() public view {
    uint256 usdAmount = 100 ether;
    uint256 expectedWeth = 0.05 ether;
    uint256 actualWeth = dsce.getTokenAmountFromUsd(weth, usdAmount);
    assertEq(expectedWeth, actualWeth);
}


//depositCollateral Tests///
function testRevertsIfcollateralZero () public {
    vm.startPrank(USER);
    ERC20Mock(weth).approve(address(dsce), AMOUNT_COLLATERAL);

    vm.expectRevert(DSCEngine.DSCEngine__NeedsMoreThanZero.selector);
    dsce.depositCollateral(weth, 0);
    vm.stopPrank();
}
}


