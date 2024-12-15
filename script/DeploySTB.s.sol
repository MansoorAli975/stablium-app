// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
import {Stablium} from "../src/Stablium.sol";
import {STBEngine} from "../src/STBEngine.sol";
import {HelperConfig} from "./HelperConfig.s.sol";

contract DeploySTB is Script {
    address[] public tokenAddresses;
    address[] public priceFeedAddresses;

    function run() external returns (Stablium, STBEngine, HelperConfig) {
        HelperConfig config = new HelperConfig();
        (address wethUsdPriceFeed, address wbtcUsdPriceFeed, address weth, address wbtc, uint256 deployerKey) =
            config.activeNetworkConfig();

        tokenAddresses = [weth, wbtc];
        priceFeedAddresses = [wethUsdPriceFeed, wbtcUsdPriceFeed];

        vm.startBroadcast(deployerKey);
        Stablium stb = new Stablium();
        STBEngine engine = new STBEngine(tokenAddresses, priceFeedAddresses, address(stb));

        stb.transferOwnership(address(engine));
        vm.stopBroadcast();
        return (stb, engine, config);
    }
}
