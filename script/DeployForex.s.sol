// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {SyntheticEUR} from "../src/SyntheticEUR.sol";
import {SyntheticGBP} from "../src/SyntheticGBP.sol";
import {SyntheticJPY} from "../src/SyntheticJPY.sol";
import {ForexEngine} from "../src/ForexEngine.sol";
import {TokenConfig} from "../src/TokenConfig.sol";
import {console} from "forge-std/console.sol";

contract DeployForex is Script {
    struct Deployment {
        ForexEngine engine;
        SyntheticEUR sEur;
        SyntheticGBP sGbp;
        SyntheticJPY sJpy;
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
        deployment.sEur = new SyntheticEUR();
        deployment.sGbp = new SyntheticGBP();
        deployment.sJpy = new SyntheticJPY();

        // Initialize arrays with proper lengths
        string[] memory symbols = new string[](3);
        address[] memory tokenAddresses = new address[](3);
        address[] memory priceFeeds = new address[](3);
        TokenConfig[] memory tokenConfigs = new TokenConfig[](3);

        // Configure EUR
        symbols[0] = "EUR";
        tokenAddresses[0] = address(deployment.sEur);
        priceFeeds[0] = network.priceFeedsSynthetic[0];
        tokenConfigs[0] = TokenConfig({
            liquidationThreshold: 50,
            bonus: 10,
            decimals: 18
        });

        // Configure GBP
        symbols[1] = "GBP";
        tokenAddresses[1] = address(deployment.sGbp);
        priceFeeds[1] = network.priceFeedsSynthetic[1];
        tokenConfigs[1] = TokenConfig({
            liquidationThreshold: 50,
            bonus: 10,
            decimals: 18
        });

        // Configure JPY
        symbols[2] = "JPY";
        tokenAddresses[2] = address(deployment.sJpy);
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

        console.log("sEur:", address(deployment.sEur));
        console.log("sGbp:", address(deployment.sGbp));
        console.log("sJpy:", address(deployment.sJpy));

        // Deploy ForexEngine
        deployment.engine = new ForexEngine(
            network.collateralTokens,
            network.priceFeedsCollateral,
            symbols,
            tokenAddresses,
            tokenConfigs,
            priceFeeds
        );
        deployment.engine.setWeth(network.collateralTokens[0]);
        // Set protocol reserve wallet
        deployment.engine.setProtocolReserveWallet(
            0xa25033FC4f01Fa8006910E42B5a1b3e9db85240b
        );
        console.log("Engine:", address(deployment.engine));

        // Transfer ownership
        deployment.sEur.transferOwnership(address(deployment.engine));
        deployment.sGbp.transferOwnership(address(deployment.engine));
        deployment.sJpy.transferOwnership(address(deployment.engine));

        vm.stopBroadcast();
        return deployment;
    }
}
