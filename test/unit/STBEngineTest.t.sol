// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {DeploySTB} from "../../script/DeploySTB.s.sol";
import {Stablium} from "../../src/Stablium.sol";
import {STBEngine} from "../../src/STBEngine.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {MockV3Aggregator} from "../mocks/MockV3Aggregator.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol"; // Correct import for the ERC20 mock

contract STBEngineTest is Test {
    DeploySTB deployer;
    Stablium stb;
    STBEngine stbe; //engine
    HelperConfig config;
    address ethUsdPriceFeed;
    address btcUsdPriceFeed;
    address weth;
    address public USER = makeAddr("user");
    uint256 public constant AMOUNT_COLLATERAL = 10 ether;
    uint256 public constant STARTING_ERC20_BALANCE = 10 ether;

    function setUp() public {
        deployer = new DeploySTB();
        (stb, stbe, config) = deployer.run();
        (ethUsdPriceFeed, btcUsdPriceFeed, weth,,) = config.activeNetworkConfig();
        ERC20Mock(weth).mint(USER, STARTING_ERC20_BALANCE);
    }

    //CONSTRUCTOR TESTS:
    address[] public tokenAddresses;
    address[] public priceFeedAddresses;

    function testRevertsIfTokenLengthDoesntMatchPriceFeeds() public {
        tokenAddresses.push(weth);
        priceFeedAddresses.push(ethUsdPriceFeed);
        priceFeedAddresses.push(btcUsdPriceFeed);

        vm.expectRevert(STBEngine.STBEngine__TokenAddressesAndPriceFeedAddressedMustBeSameLength.selector);
        new STBEngine(tokenAddresses, priceFeedAddresses, address(stb));
    }

    //PRICE TESTS:
    function testGetUsdValue() public view {
        uint256 ethAmount = 15e18;
        uint256 expectedUsd = 30000e18;
        uint256 actualUsd = stbe.getUsdValue(weth, ethAmount);
        assertEq(expectedUsd, actualUsd);
    }

    function testGetTokenAmountFromUsd() public view {
        uint256 usdAmount = 100 ether;
        uint256 expectedWeth = 0.05 ether;
        uint256 actualWeth = stbe.getTokenAmountFromUsd(weth, usdAmount);
        assertEq(expectedWeth, actualWeth);
    }

    //depositCollateral Tests:
    function testRevertsIfcollateralZero() public {
        vm.startPrank(USER);
        ERC20Mock(weth).approve(address(stbe), AMOUNT_COLLATERAL);

        vm.expectRevert(STBEngine.STBEngine__NeedsMoreThanZero.selector);
        stbe.depositCollateral(weth, 0);
        vm.stopPrank();
    }

    // New Test for Checking Collateral Balance of User
    function testGetCollateralBalanceOfUser() public {
        // Arrange: Deposit collateral for the user
        vm.startPrank(USER);
        ERC20Mock(weth).approve(address(stbe), AMOUNT_COLLATERAL); // Approve collateral
        stbe.depositCollateral(weth, AMOUNT_COLLATERAL); // Deposit the collateral
        vm.stopPrank();

        // Act: Call getCollateralBalanceOfUser to fetch the balance for the user
        uint256 balance = stbe.getCollateralBalanceOfUser(USER, weth);

        // Assert: Verify the balance is as expected
        assertEq(balance, AMOUNT_COLLATERAL, "The collateral balance should match the deposited amount.");
    }
}
