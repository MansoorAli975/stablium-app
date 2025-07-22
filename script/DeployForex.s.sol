// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {SyntheticEUR} from "../src/SyntheticEUR.sol";
import {SyntheticGBP} from "../src/SyntheticGBP.sol";
import {SyntheticJPY} from "../src/SyntheticJPY.sol";
import {ForexEngine} from "../src/ForexEngine.sol";
import {TokenConfig} from "../src/TokenConfig.sol";
import "forge-std/console.sol";

contract DeployForex is Script {
    struct Deployment {
        ForexEngine engine;
        SyntheticEUR sEUR;
        SyntheticGBP sGBP;
        SyntheticJPY sJPY;
        HelperConfig config;
    }

    function run() external returns (Deployment memory) {
        Deployment memory deployment;
        deployment.config = new HelperConfig();
        HelperConfig.NetworkConfig memory network = deployment
            .config
            .getNetworkConfig();

        vm.startBroadcast(network.deployerKey);

        // Deploy synthetic tokens
        deployment.sEUR = new SyntheticEUR();
        deployment.sGBP = new SyntheticGBP();
        deployment.sJPY = new SyntheticJPY();

        // Initialize arrays with proper lengths
        string[] memory symbols = new string[](3);
        address[] memory tokenAddresses = new address[](3);
        address[] memory priceFeeds = new address[](3);
        TokenConfig[] memory tokenConfigs = new TokenConfig[](3);

        // Configure EUR
        symbols[0] = "EUR";
        tokenAddresses[0] = address(deployment.sEUR);
        priceFeeds[0] = network.priceFeedsSynthetic[0];
        tokenConfigs[0] = TokenConfig({
            liquidationThreshold: 50,
            bonus: 10,
            decimals: 18
        });

        // Configure GBP
        symbols[1] = "GBP";
        tokenAddresses[1] = address(deployment.sGBP);
        priceFeeds[1] = network.priceFeedsSynthetic[1];
        tokenConfigs[1] = TokenConfig({
            liquidationThreshold: 50,
            bonus: 10,
            decimals: 18
        });

        // Configure JPY
        symbols[2] = "JPY";
        tokenAddresses[2] = address(deployment.sJPY);
        priceFeeds[2] = network.priceFeedsSynthetic[2];
        tokenConfigs[2] = TokenConfig({
            liquidationThreshold: 50,
            bonus: 10,
            decimals: 18
        });

        // ...
        console.log("Feed EUR/USD:", priceFeeds[0]);
        console.log("Feed GBP/USD:", priceFeeds[1]);
        console.log("Feed JPY/USD:", priceFeeds[2]);

        console.log("sEUR:", address(deployment.sEUR));
        console.log("sGBP:", address(deployment.sGBP));
        console.log("sJPY:", address(deployment.sJPY));

        // Deploy ForexEngine
        deployment.engine = new ForexEngine(
            network.collateralTokens,
            network.priceFeedsCollateral,
            symbols,
            tokenAddresses,
            tokenConfigs,
            priceFeeds
        );

        // Set protocol reserve wallet
        deployment.engine.setProtocolReserveWallet(
            0xa25033FC4f01Fa8006910E42B5a1b3e9db85240b
        );

        // Transfer ownership
        deployment.sEUR.transferOwnership(address(deployment.engine));
        deployment.sGBP.transferOwnership(address(deployment.engine));
        deployment.sJPY.transferOwnership(address(deployment.engine));

        vm.stopBroadcast();
        return deployment;
    }
}
