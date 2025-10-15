// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockV3Aggregator} from "../test/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

contract DeployGBPMock is Script {
    function run() external returns (address feed) {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        // GBP/USD ~ 1.27 -> 127_000_000 at 8 decimals
        MockV3Aggregator m = new MockV3Aggregator(8, 127_000_000);
        feed = address(m);
        console.log("GBP mock deployed at:", feed);
        vm.stopBroadcast();
    }
}
