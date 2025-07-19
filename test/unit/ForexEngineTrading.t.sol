// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test, console} from "forge-std/Test.sol";
import {DeployForex} from "../../script/DeployForex.s.sol";
import {ForexEngine} from "../../src/ForexEngine.sol";
import {SyntheticEUR} from "../../src/SyntheticEUR.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import {MockV3Aggregator} from "../../test/mocks/MockV3Aggregator.sol"; // Using mock for tests

contract ForexEngineTradingTest is Test {
    ForexEngine public engine;
    SyntheticEUR public sEUR;
    ERC20Mock public weth;

    address public user = address(1);
    uint256 public constant MARGIN_USD = 1000 * 1e18; // $1000 margin
    uint256 public constant LEVERAGE = 1;

    function setUp() public {
        DeployForex deployScript = new DeployForex();
        DeployForex.Deployment memory deployed = deployScript.run();

        engine = deployed.engine;
        sEUR = deployed.sEUR;
        weth = ERC20Mock(engine.getCollateralTokens()[0]);

        // Give user plenty of WETH (100 ETH)
        deal(address(weth), user, 10000 * 1e18);

        // Approve ForexEngine
        vm.startPrank(user);
        weth.approve(address(engine), type(uint256).max);
        vm.stopPrank();
    }

    function testOpenAndClosePosition() public {
        vm.startPrank(user);

        // Get current WETH price from feed (returns 1800e8)
        address wethFeed = engine.getPriceFeed(address(weth));
        MockV3Aggregator priceFeed = MockV3Aggregator(wethFeed);
        (, int256 wethPrice, , , ) = priceFeed.latestRoundData();

        // Calculate required WETH collateral for $1000 margin
        uint256 marginWETH = (MARGIN_USD * 1e8) / uint256(wethPrice);

        // Deposit enough collateral (10x margin to ensure safe ratio)
        uint256 totalDeposit = marginWETH * 10;

        console.log("Calculated WETH Margin:", marginWETH);
        console.log("Total WETH Deposit:", totalDeposit);

        engine.depositCollateral(address(weth), totalDeposit);

        // Validate collateral value in USD
        uint256 collateralValue = engine.getUserCollateralValue(user);
        console.log("Collateral value (USD):", collateralValue);
        assertGt(collateralValue, MARGIN_USD, "Collateral too low");

        // Check margin ratio before opening (should be max since no positions open)
        uint256 marginRatioBefore = engine.getUserMarginRatio(user);
        console.log("Margin ratio before opening:", marginRatioBefore);
        assertEq(
            marginRatioBefore,
            10000,
            "Should have 100% margin ratio with no positions"
        );

        // Open position with 1x leverage
        engine.openPosition("sEUR", true, marginWETH, LEVERAGE);

        // Check margin ratio after opening
        uint256 marginRatioAfter = engine.getUserMarginRatio(user);
        console.log("Margin ratio after opening:", marginRatioAfter);
        assertGt(
            marginRatioAfter,
            engine.MIN_MARGIN_PERCENT() * 100,
            "Margin ratio too low"
        );

        // Verify position opened
        ForexEngine.Position[] memory positions = engine.getOpenPositions(user);
        assertEq(positions.length, 1, "Position not opened");
        assertTrue(positions[0].isOpen, "Position should be open");

        // Close position
        engine.closePosition(0);

        // Verify position closed
        positions = engine.getUserPositionsPaginated(user, 0, 10);
        assertFalse(positions[0].isOpen, "Position should be closed");
        assertEq(
            positions[0].pnl,
            0,
            "Expected PnL to be 0 with static price feed"
        );

        vm.stopPrank();
    }
}
