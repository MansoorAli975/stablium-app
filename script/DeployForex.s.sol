// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
import {HelperConfig} from "./HelperConfig.s.sol";
import {SyntheticUSD} from "../src/SyntheticUSD.sol";
import {SyntheticEUR} from "../src/SyntheticEUR.sol";
import {SyntheticGBP} from "../src/SyntheticGBP.sol";
import {SyntheticJPY} from "../src/SyntheticJPY.sol";
import {ForexEngine} from "../src/ForexEngine.sol";

contract DeployForex is Script {
    struct Deployment {
        ForexEngine engine;
        SyntheticUSD sUSD;
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
        deployment.sUSD = new SyntheticUSD();
        deployment.sEUR = new SyntheticEUR();
        deployment.sGBP = new SyntheticGBP();
        deployment.sJPY = new SyntheticJPY();

        // Prepare symbols and addresses arrays
        string[] memory symbols = new string[](4);
        address[] memory addresses = new address[](4);

        symbols[0] = "sUSD";
        addresses[0] = address(deployment.sUSD);
        symbols[1] = "sEUR";
        addresses[1] = address(deployment.sEUR);
        symbols[2] = "sGBP";
        addresses[2] = address(deployment.sGBP);
        symbols[3] = "sJPY";
        addresses[3] = address(deployment.sJPY);

        // Deploy ForexEngine
        deployment.engine = new ForexEngine(
            network.collateralTokens,
            network.priceFeedsCollateral,
            symbols,
            addresses,
            network.tokenConfigs,
            network.priceFeedsSynthetic
        );

        // Set protocol reserve wallet
        deployment.engine.setProtocolReserveWallet(
            0xa25033FC4f01Fa8006910E42B5a1b3e9db85240b
        );

        // Transfer ownership of synthetic tokens to engine
        deployment.sUSD.transferOwnership(address(deployment.engine));
        deployment.sEUR.transferOwnership(address(deployment.engine));
        deployment.sGBP.transferOwnership(address(deployment.engine));
        deployment.sJPY.transferOwnership(address(deployment.engine));

        vm.stopBroadcast();

        return deployment;
    }

    // 🧪 For test-specific mock override
    function runWithMocks(
        address weth,
        address wethFeed,
        address sEURFeed
    ) external returns (Deployment memory) {
        Deployment memory deployment;
        deployment.config = new HelperConfig();

        // 👇 Get clean mock config and override specific feeds
        HelperConfig.NetworkConfig memory network = deployment
            .config
            .getAnvilMockConfig();

        network.collateralTokens[0] = weth;
        network.priceFeedsCollateral[0] = wethFeed;
        network.priceFeedsSynthetic[1] = sEURFeed;

        vm.startBroadcast(network.deployerKey);

        // Deploy synthetic tokens
        deployment.sUSD = new SyntheticUSD();
        deployment.sEUR = new SyntheticEUR();
        deployment.sGBP = new SyntheticGBP();
        deployment.sJPY = new SyntheticJPY();

        // Prepare symbols and addresses arrays
        string[] memory symbols = new string[](4);
        address[] memory addresses = new address[](4);

        symbols[0] = "sUSD";
        addresses[0] = address(deployment.sUSD);
        symbols[1] = "sEUR";
        addresses[1] = address(deployment.sEUR);
        symbols[2] = "sGBP";
        addresses[2] = address(deployment.sGBP);
        symbols[3] = "sJPY";
        addresses[3] = address(deployment.sJPY);

        // Deploy ForexEngine with overridden config
        deployment.engine = new ForexEngine(
            network.collateralTokens,
            network.priceFeedsCollateral,
            symbols,
            addresses,
            network.tokenConfigs,
            network.priceFeedsSynthetic
        );

        // Set reserve wallet
        deployment.engine.setProtocolReserveWallet(
            0xa25033FC4f01Fa8006910E42B5a1b3e9db85240b
        );

        // Set test-time feeds again for clarity
        deployment.engine.setCollateralToken(weth, wethFeed);
        deployment.engine.setSyntheticPriceFeed("sEUR", sEURFeed);

        // Transfer ownership of synthetic tokens to engine
        deployment.sUSD.transferOwnership(address(deployment.engine));
        deployment.sEUR.transferOwnership(address(deployment.engine));
        deployment.sGBP.transferOwnership(address(deployment.engine));
        deployment.sJPY.transferOwnership(address(deployment.engine));

        vm.stopBroadcast();

        return deployment;
    }
}
