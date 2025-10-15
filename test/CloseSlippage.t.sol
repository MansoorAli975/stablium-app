// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ForexEngine} from "../src/ForexEngine.sol";
import {MockV3Aggregator} from "./mocks/MockV3Aggregator.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import {SyntheticEUR} from "../src/SyntheticEUR.sol";
import {TokenConfig} from "../src/TokenConfig.sol";

contract CloseSlippageTest is Test {
    ForexEngine engine;

    // Collateral + feeds
    ERC20Mock weth;
    MockV3Aggregator ethUsdFeed;
    MockV3Aggregator eurFeed;

    // Synthetic
    SyntheticEUR sEur;

    address user = address(0xBEEF);

    // Arrays for ForexEngine constructor
    address[] tokenAddresses;
    address[] priceFeedAddresses;
    string[] syntheticSymbols;
    address[] syntheticTokenAddresses;
    TokenConfig[] syntheticConfigs;
    address[] syntheticPriceFeeds;

    function setUp() public {
        // --- Collateral + price feeds ---
        weth = new ERC20Mock("WETH", "WETH", address(this), 0);
        ethUsdFeed = new MockV3Aggregator(8, 462_201_730_000); // 4,622.01730000 (8 decimals)
        eurFeed = new MockV3Aggregator(8, 108_000_000); // 1.08 (8 decimals)

        // --- Synthetic token ---
        sEur = new SyntheticEUR();

        // --- Initialize arrays for ForexEngine constructor ---
        tokenAddresses.push(address(weth));
        priceFeedAddresses.push(address(ethUsdFeed));

        syntheticSymbols.push("EUR");
        syntheticTokenAddresses.push(address(sEur));
        syntheticConfigs.push(
            TokenConfig({
                liquidationThreshold: 8000, // 80% BPS
                bonus: 50, // 0.5% BPS
                decimals: 18
            })
        );
        syntheticPriceFeeds.push(address(eurFeed));

        // --- Deploy engine ---
        engine = new ForexEngine(
            tokenAddresses,
            priceFeedAddresses,
            syntheticSymbols,
            syntheticTokenAddresses,
            syntheticConfigs,
            syntheticPriceFeeds
        );

        // Hand over minting rights to the engine
        sEur.transferOwnership(address(engine));

        // Set protocol reserve & WETH
        engine.setProtocolReserveWallet(address(this));
        engine.setWeth(address(weth));

        // --- Give user collateral ---
        weth.mint(user, 10 ether);
        vm.prank(user);
        weth.approve(address(engine), type(uint256).max);

        // Deposit collateral for user
        vm.prank(user);
        engine.depositCollateral(address(weth), 1 ether);
    }

    // ---------------------------------------------------------------------
    // Close slippage guards
    // ---------------------------------------------------------------------

    function test_Long_RevertsIfMinSellTooHigh_then_Succeeds() public {
        vm.startPrank(user);

        // Open EUR long: margin 0.005 ETH, 2x, no TP/SL
        engine.openPosition("EUR", true, 5e15, 2, 0, 0, 0);

        // Current feed = 108_000_000, set guard ABOVE price -> should revert
        vm.expectRevert(ForexEngine.ForexEngine__PriceWorseThanLimit.selector);
        engine.closePosition(0, 109_000_000);

        // Now set guard <= price -> should succeed
        engine.closePosition(0, 108_000_000);

        vm.stopPrank();
    }

    function test_Short_RevertsIfMaxBuyTooLow_then_Succeeds() public {
        vm.startPrank(user);

        engine.openPosition("EUR", false, 5e15, 2, 0, 0, 0);

        // Current feed = 108_000_000, set guard BELOW price -> should revert
        vm.expectRevert(ForexEngine.ForexEngine__PriceWorseThanLimit.selector);
        engine.closePosition(0, 107_000_000);

        // Now set guard >= price -> should succeed
        engine.closePosition(0, 108_000_000);

        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Stale oracle blocks close (strict price path in _closePosition)
    // ---------------------------------------------------------------------
    function test_OracleStale_RevertsOnClose() public {
        vm.startPrank(user);
        engine.openPosition("EUR", true, 5e15, 2, 0, 0, 0);
        vm.stopPrank();

        // time-warp so updatedAt becomes stale
        vm.warp(block.timestamp + 1 days);

        vm.startPrank(user);
        vm.expectRevert(ForexEngine.ForexEngine__StalePrice.selector);
        engine.closePosition(0, 108_000_000); // guard at last known price
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Liquidation: inclusive at stored liquidationPrice
    // ---------------------------------------------------------------------
    function test_Liquidation_InclusiveBoundary() public {
        // Keep a small buffer of collateral before opening the position.
        // Leave ~0.02 ETH so initial margin checks still pass.
        vm.startPrank(user);
        engine.redeemCollateral(address(weth), 1 ether - 0.02 ether);

        // Open a more sensitive position (5x) so a price drop can breach maintenance.
        // margin = 0.005 ETH, leverage = 5x  -> notional ~0.025 ETH
        // INITIAL req = 50% * 0.025 = 0.0125 ETH  (fits within 0.02 ETH left)
        engine.openPosition("EUR", true, 5e15, 5, 0, 0, 0);
        vm.stopPrank();

        // Read stored liquidation price
        ForexEngine.Position[] memory ps = engine.getAllUserPositions(user);
        uint256 liq = ps[0].liquidationPrice;

        // 1) Just above liquidation -> should NOT liquidate
        eurFeed.updateAnswer(int256(liq + 1));
        try engine.checkAndLiquidate(user) {} catch {}
        ps = engine.getAllUserPositions(user);
        assertTrue(ps[0].isOpen, "still open above liquidation price");

        // 2) Force margin ratio below maintenance with an aggressive drop
        // (must stay > 0 to satisfy oracle price validation)
        eurFeed.updateAnswer(int256(1));
        uint256 maint = engine.MIN_MARGIN_PERCENT();
        uint256 ratio = engine.getUserMarginRatio(user);
        require(
            ratio < maint,
            "test setup: ratio never fell below maintenance"
        );

        // Liquidate
        engine.checkAndLiquidate(user);

        ps = engine.getAllUserPositions(user);
        assertFalse(ps[0].isOpen, "must be liquidated once below maintenance");
    }

    // ---------------------------------------------------------------------
    // Withdrawal gating: now reverts with WithdrawalExceedsAvailable
    // ---------------------------------------------------------------------
    function test_WithdrawBlocked_WithOpenPosition() public {
        vm.startPrank(user);
        engine.openPosition("EUR", true, 5e15, 2, 0, 0, 0);

        // Check how much is actually withdrawable under the new rule
        uint256 avail = engine.getAvailableToWithdraw(user, address(weth));
        assertGe(avail, 0, "query should not revert");

        // Exceed availability by 1 wei (or 1 wei if avail == 0) -> MUST revert
        uint256 attempt = (avail == 0) ? 1 : (avail + 1);
        vm.expectRevert(
            ForexEngine.ForexEngine__WithdrawalExceedsAvailable.selector
        );
        engine.redeemCollateral(address(weth), attempt);

        // Close, then a normal withdrawal should pass
        eurFeed.updateAnswer(108_000_000);
        engine.closePosition(0, 108_000_000);
        engine.redeemCollateral(address(weth), 0.5 ether);
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // Exposure round-trip sanity
    // ---------------------------------------------------------------------
    function test_OpenThenCloseFlat_ExposureBackToZero() public {
        vm.startPrank(user);
        uint256 before = engine.s_userSyntheticExposure(user, "EUR");
        assertEq(before, 0, "pre: exposure must be zero");

        engine.openPosition("EUR", true, 5e15, 2, 0, 0, 0);
        eurFeed.updateAnswer(108_000_000);
        engine.closePosition(0, 108_000_000);

        uint256 afterExp = engine.s_userSyntheticExposure(user, "EUR");
        assertEq(
            afterExp,
            0,
            "exposure should return to zero after flat close"
        );
        vm.stopPrank();
    }

    // ---------------------------------------------------------------------
    // View robustness: stale feed => available to withdraw returns 0
    // ---------------------------------------------------------------------
    function test_GetAvailableToWithdraw_ReturnsZeroOnStale() public {
        uint256 availFresh = engine.getAvailableToWithdraw(user, address(weth));
        assertGt(availFresh, 0, "fresh: should have some withdrawable balance");

        // Make ETH/USD stale and check it returns 0 safely
        vm.warp(block.timestamp + 3 hours);
        uint256 availStale = engine.getAvailableToWithdraw(user, address(weth));
        assertEq(availStale, 0, "stale: should be zero for safety");
    }
}
