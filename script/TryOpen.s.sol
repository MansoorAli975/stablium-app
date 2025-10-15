// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {ForexEngine} from "../src/ForexEngine.sol";

// Minimal interface with the new 7-arg signature
interface IOpen7 {
    function openPosition(
        string calldata pair,
        bool isLong,
        uint256 margin,
        uint256 leverage,
        uint256 takeProfit, // 1e18 price or 0
        uint256 stopLoss, // 1e18 price or 0
        uint256 acceptablePx // 1e18 slippage guard; try 0 first
    ) external;
}

contract TryOpen is Script {
    function run() external {
        address engineAddr = vm.envAddress("ENGINE_ADDRESS");
        address trader = vm.envAddress("TRADER");
        address weth = vm.envAddress("WETH_ADDRESS");

        ForexEngine engine = ForexEngine(payable(engineAddr));
        IOpen7 engine7 = IOpen7(engineAddr);

        // Show useful pre-state
        uint256 eurUsd = engine.getDerivedPrice("EUR", "USD");
        console2.log("EUR/USD (1e18):", eurUsd);

        uint256 collBal = engine.getCollateralBalance(trader, weth);
        console2.log("Trader collateral (WETH wei):", collBal);

        uint256 mrBps = engine.getUserMarginRatio(trader);
        console2.log("User margin ratio (bps):", mrBps);

        // --- simulate openPosition (no broadcast) to capture revert reason ---
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        engine7.openPosition(
            "EUR/USD",
            true, // isLong
            5e15, // margin = 0.005 WETH
            2, // leverage = 2x
            0, // TP
            0, // SL
            0 // acceptablePx (0 = accept current oracle price)
        );
        vm.stopBroadcast();

        console2.log("openPosition() succeeded");
    }
}
