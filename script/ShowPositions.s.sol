// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Match EXACT order & types returned by ForexEngine.getAllUserPositions
struct Position {
    address user; // 0
    string pair; // 1
    bool isLong; // 2
    uint256 entryPrice; // 3 (feed decimals, e.g. 8)
    uint256 marginUsed; // 4 (wei)
    uint256 leverage; // 5
    uint256 tradeSize; // 6 (notional 1e18?)
    uint256 timestamp; // 7
    bool isOpen; // 8
    uint256 exitPrice; // 9
    int256 pnl; // 10 (signed)
    uint256 closeTimestamp; // 11
    uint256 takeProfitPrice; //12
    uint256 stopLossPrice; //13
    uint256 liquidationPrice; //14
    uint256 baseUnits; // 15
}

interface IEngineView {
    function getAllUserPositions(address user) external view returns (Position[] memory);
}

contract ShowPositions is Script {
    function run() external view {
        address engineAddr = vm.envAddress("ENGINE_ADDRESS");
        address user = vm.envAddress("TRADER");

        IEngineView engine = IEngineView(engineAddr);
        Position[] memory ps = engine.getAllUserPositions(user);

        console.log("positions:", ps.length);
        for (uint256 i = 0; i < ps.length; i++) {
            console.log("---- index", i);
            console.log("user:", ps[i].user);
            console.log("pair:", ps[i].pair);
            console.log("isLong:", ps[i].isLong);
            console.log("isOpen:", ps[i].isOpen);

            console.log("entryPrice (feed-decimals):", ps[i].entryPrice);
            console.log("marginUsed (wei):", ps[i].marginUsed);
            console.log("leverage:", ps[i].leverage);
            console.log("tradeSize:", ps[i].tradeSize);
            console.log("baseUnits:", ps[i].baseUnits);

            console.log("takeProfitPrice:", ps[i].takeProfitPrice);
            console.log("stopLossPrice:", ps[i].stopLossPrice);
            console.log("liquidationPrice:", ps[i].liquidationPrice);

            console.log("openedAt:", ps[i].timestamp);
            console.log("exitPrice:", ps[i].exitPrice);
            console.log("closedAt:", ps[i].closeTimestamp);
            console.logInt(ps[i].pnl); // signed PnL
        }
    }
}
