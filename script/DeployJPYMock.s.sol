// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockV3Aggregator} from "test/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

contract DeployJPYMock is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        // 8 decimals, initial price = 700000 => 0.00700000 USD per JPY
        MockV3Aggregator jpy = new MockV3Aggregator(8, 700000);
        console.log("JPY mock deployed at:", address(jpy));
        vm.stopBroadcast();
    }
}
