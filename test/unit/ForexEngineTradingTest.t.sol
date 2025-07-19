// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test, console} from "forge-std/Test.sol";
import {DeployForex} from "../../script/DeployForex.s.sol";
import {ForexEngine} from "../../src/ForexEngine.sol";
import {SyntheticEUR} from "../../src/SyntheticEUR.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import {MockV3Aggregator} from "../../test/mocks/MockV3Aggregator.sol";

contract ForexEngineTradingTest is Test {
    ForexEngine public engine;
    SyntheticEUR public sEUR;
    ERC20Mock public weth;
    MockV3Aggregator public eurUsdFeed;
    MockV3Aggregator public wethUsdFeed;

    address public user = address(1);
    address public reserve;

    function setUp() public {
        // Create test-specific mocks
        weth = new ERC20Mock("WETH", "WETH", address(this), 0);
        eurUsdFeed = new MockV3Aggregator(8, 100e8); // 1 EUR = 1.00 USD
        wethUsdFeed = new MockV3Aggregator(8, 1800e8); // 1 WETH = 1800 USD

        // Deploy app using our mocks
        DeployForex deployScript = new DeployForex();
        DeployForex.Deployment memory deployed = deployScript.runWithMocks(
            address(weth), // Use our test WETH
            address(wethUsdFeed),
            address(eurUsdFeed)
        );

        engine = deployed.engine;
        sEUR = deployed.sEUR;
        reserve = engine.getProtocolReserveWallet();

        // Prepare test user
        vm.startPrank(user);
        weth.mint(user, 10_000 * 1e18);
        weth.approve(address(engine), type(uint256).max);
        vm.stopPrank();

        // Fund and approve reserve (must use same WETH as engine)
        vm.startPrank(reserve);
        weth.mint(reserve, 100 * 1e18);
        weth.approve(address(engine), type(uint256).max);
        vm.stopPrank();
    }

    function testOpenAndCloseWithPnL() public {
        vm.startPrank(user);

        // 1. Deposit 50 WETH as margin
        uint256 collateralAmount = 50 * 1e18;
        engine.depositCollateral(address(weth), collateralAmount);

        // 2. Verify initial margin ratio
        uint256 initialMargin = engine.getUserMarginRatio(user);
        assertEq(initialMargin, 10000, "Initial margin should be 100%");

        // 3. Open long position with 1 WETH margin at 1x
        uint256 marginWETH = 1 * 1e18;
        engine.openPosition("sEUR", true, marginWETH, 1);

        // 4. Verify open position
        ForexEngine.Position[] memory positions = engine.getOpenPositions(user);
        assertEq(positions.length, 1, "Should have 1 open position");

        // 5. Simulate 20% price gain in EUR/USD
        eurUsdFeed.updateAnswer(120e8); // 1 EUR = 1.20 USD

        // 6. Check margin has improved
        uint256 updatedMargin = engine.getUserMarginRatio(user);
        assertGt(updatedMargin, 10000, "Margin ratio should increase");

        // 7. Close position
        engine.closePosition(0);

        // 8. Verify position closed and PnL positive
        positions = engine.getUserPositionsPaginated(user, 0, 10);
        assertFalse(positions[0].isOpen, "Position should be closed");
        assertGt(positions[0].pnl, 0, "Should have profit");

        vm.stopPrank();
    }

    function testShortPositionWithLoss() public {
        vm.startPrank(user);

        // 1. Deposit 50 WETH as margin
        uint256 collateralAmount = 50 * 1e18;
        engine.depositCollateral(address(weth), collateralAmount);

        // 2. Verify deposit
        uint256 marginBefore = engine.getCollateralBalance(user, address(weth));
        assertEq(marginBefore, collateralAmount, "Deposit failed");

        vm.stopPrank();

        // 3. Mint sEUR to reserve using engine (which is the token owner)
        vm.prank(address(engine));
        sEUR.mint(reserve, 1_000e18);

        // 4. Approve sEUR for use by engine
        vm.startPrank(reserve);
        sEUR.approve(address(engine), type(uint256).max);
        vm.stopPrank();

        // 5. Set initial EUR/USD price to 1.00
        eurUsdFeed.updateAnswer(100e8);

        // 6. Open SHORT position with 1 WETH margin at 1x
        vm.startPrank(user);
        engine.openPosition("sEUR", false, 1e18, 1); // SHORT
        vm.stopPrank();

        // 7. Simulate EUR/USD price rising to 1.20 → user loses
        eurUsdFeed.updateAnswer(120e8);

        // 8. Close the short position
        vm.startPrank(user);
        engine.closePosition(0);
        vm.stopPrank();

        // 9. Check final position and loss (call as user)
        vm.prank(user);
        ForexEngine.Position[] memory positions = engine
            .getUserPositionsPaginated(user, 0, 10);

        assertEq(positions.length, 1, "Should have 1 position");
        assertFalse(positions[0].isOpen, "Position should be closed");
        assertLt(positions[0].pnl, 0, "Short should lose when price rises");

        // 10. Final margin check (call as user)
        vm.prank(user);
        uint256 marginAfter = engine.getCollateralBalance(user, address(weth));
        assertLt(
            marginAfter,
            marginBefore,
            "Collateral should decrease due to loss"
        );
    }

    function testShortPositionWithProfit() public {
        vm.startPrank(user);

        // 1. Deposit 50 WETH as margin
        uint256 collateralAmount = 50 * 1e18;
        engine.depositCollateral(address(weth), collateralAmount);

        // 2. Verify deposit
        uint256 marginBefore = engine.getCollateralBalance(user, address(weth));
        assertEq(marginBefore, collateralAmount, "Deposit failed");

        vm.stopPrank();

        // 3. Mint sEUR to reserve using engine (which is the token owner)
        vm.prank(address(engine));
        sEUR.mint(reserve, 1_000e18);

        // 4. Approve sEUR for use by engine
        vm.startPrank(reserve);
        sEUR.approve(address(engine), type(uint256).max);
        vm.stopPrank();

        // 5. Set initial EUR/USD price to 1.00
        eurUsdFeed.updateAnswer(100e8);

        // 6. Open SHORT position with 1 WETH margin at 1x
        vm.startPrank(user);
        engine.openPosition("sEUR", false, 1e18, 1); // SHORT
        vm.stopPrank();

        // 7. Simulate EUR/USD price dropping to 0.80 → user should profit
        eurUsdFeed.updateAnswer(80e8);

        // 8. Close the short position
        vm.startPrank(user);
        engine.closePosition(0);
        vm.stopPrank();

        // 9. Check final position and profit (call as user)
        vm.prank(user);
        ForexEngine.Position[] memory positions = engine
            .getUserPositionsPaginated(user, 0, 10);

        assertEq(positions.length, 1, "Should have 1 position");
        assertFalse(positions[0].isOpen, "Position should be closed");
        assertGt(positions[0].pnl, 0, "Short should profit when price drops");

        // 10. Final margin check (call as user)
        vm.prank(user);
        uint256 marginAfter = engine.getCollateralBalance(user, address(weth));
        assertGt(
            marginAfter,
            marginBefore,
            "Collateral should increase due to profit"
        );
    }

    function testLongPositionWithLoss() public {
        vm.startPrank(user);

        // 1. Deposit 50 WETH as margin
        uint256 collateralAmount = 50 * 1e18;
        engine.depositCollateral(address(weth), collateralAmount);

        // 2. Verify deposit
        uint256 marginBefore = engine.getCollateralBalance(user, address(weth));
        assertEq(marginBefore, collateralAmount, "Deposit failed");

        vm.stopPrank();

        // 3. Mint sEUR to reserve using engine (which is the token owner)
        vm.prank(address(engine));
        sEUR.mint(reserve, 1_000e18);

        // 4. Approve sEUR for use by engine
        vm.startPrank(reserve);
        sEUR.approve(address(engine), type(uint256).max);
        vm.stopPrank();

        // 5. Set initial EUR/USD price to 1.00
        eurUsdFeed.updateAnswer(100e8);

        // 6. Open LONG position with 1 WETH margin at 1x
        vm.startPrank(user);
        engine.openPosition("sEUR", true, 1e18, 1); // LONG
        vm.stopPrank();

        // 7. Simulate EUR/USD price dropping to 0.80 → user loses
        eurUsdFeed.updateAnswer(80e8);

        // 8. Close the long position
        vm.startPrank(user);
        engine.closePosition(0);
        vm.stopPrank();

        // 9. Check final position and loss (call as user)
        vm.prank(user);
        ForexEngine.Position[] memory positions = engine
            .getUserPositionsPaginated(user, 0, 10);

        assertEq(positions.length, 1, "Should have 1 position");
        assertFalse(positions[0].isOpen, "Position should be closed");
        assertLt(positions[0].pnl, 0, "Long should lose when price falls");

        // 10. Final margin check (call as user)
        vm.prank(user);
        uint256 marginAfter = engine.getCollateralBalance(user, address(weth));
        assertLt(
            marginAfter,
            marginBefore,
            "Collateral should decrease due to loss"
        );
    }
}
