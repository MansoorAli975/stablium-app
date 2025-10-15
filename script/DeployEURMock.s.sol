// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockV3Aggregator} from "../test/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

contract DeployEURMock is Script {
    function run() external returns (address feed) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // Decimals = 8, Initial EUR/USD ≈ 1.08 -> 108,000,000
        MockV3Aggregator mock = new MockV3Aggregator(8, 108_000_000);

        vm.stopBroadcast();
        console.log("EUR mock deployed at:", address(mock));
        return address(mock);
    }
}
