// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockV3Aggregator} from "test/mocks/MockV3Aggregator.sol";
import {console} from "forge-std/console.sol";

/// Deploys a Mock ETH/USD feed with 8 decimals and ~$4,622.0173
contract DeployETHMock is Script {
    function run() external returns (address feed) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        // Use the ETH/USD you saw from Chainlink: 462201730000 (8 decimals)
        MockV3Aggregator mock = new MockV3Aggregator(8, 462201730000);
        vm.stopBroadcast();
        console.log("ETH/USD mock deployed at:", address(mock));
        return address(mock);
    }
}
