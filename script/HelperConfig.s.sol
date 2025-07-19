// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
import {MockV3Aggregator} from "../test/mocks/MockV3Aggregator.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import {TokenConfig} from "../src/TokenConfig.sol";

contract HelperConfig is Script {
    struct NetworkConfig {
        address[] collateralTokens;
        address[] priceFeedsCollateral;
        address[] priceFeedsSynthetic;
        address weth;
        address wbtc;
        uint256 deployerKey;
        TokenConfig[] tokenConfigs;
    }

    NetworkConfig public activeNetworkConfig;

    constructor() {
        activeNetworkConfig = getNetworkConfig();
    }

    function getNetworkConfig() public returns (NetworkConfig memory) {
        if (block.chainid == 11155111) {
            return getSepoliaConfig();
        } else {
            return getAnvilConfig();
        }
    }

    function getSepoliaConfig() public view returns (NetworkConfig memory) {
        // Properly initialized arrays
        address[] memory collaterals = new address[](2);
        address[] memory priceFeedsCollateral = new address[](2);
        address[] memory priceFeedsSynthetic = new address[](4);
        TokenConfig[] memory tokenConfigs = new TokenConfig[](4);

        // Sepolia addresses
        collaterals[0] = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81; // WETH
        collaterals[1] = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063; // WBTC

        priceFeedsCollateral[0] = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // WETH/USD
        priceFeedsCollateral[1] = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43; // WBTC/USD

        priceFeedsSynthetic[0] = address(0); // sUSD
        priceFeedsSynthetic[1] = 0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910; // EUR/USD
        priceFeedsSynthetic[2] = 0x91FAB41F5f3bE955963a986366edAcff1aaeaa83; // GBP/USD
        priceFeedsSynthetic[3] = 0x8A6af2B75F23831ADc973ce6288e5329F63D86c6; // JPY/USD

        for (uint256 i = 0; i < tokenConfigs.length; i++) {
            tokenConfigs[i] = TokenConfig(50, 10, 18);
        }

        return
            NetworkConfig({
                collateralTokens: collaterals,
                priceFeedsCollateral: priceFeedsCollateral,
                priceFeedsSynthetic: priceFeedsSynthetic,
                weth: collaterals[0],
                wbtc: collaterals[1],
                deployerKey: vm.envUint("PRIVATE_KEY"), // Use env var
                tokenConfigs: tokenConfigs
            });
    }

    function getAnvilConfig() public returns (NetworkConfig memory) {
        if (activeNetworkConfig.collateralTokens.length != 0) {
            return activeNetworkConfig;
        }

        vm.startBroadcast();

        ERC20Mock weth = new ERC20Mock(
            "Mock WETH",
            "WETH",
            address(this),
            1e21
        );
        ERC20Mock wbtc = new ERC20Mock(
            "Mock WBTC",
            "WBTC",
            address(this),
            1e21
        );

        MockV3Aggregator wethPriceFeed = new MockV3Aggregator(8, 1800e8);
        MockV3Aggregator wbtcPriceFeed = new MockV3Aggregator(8, 30000e8);

        address sUSD_feed = address(0);
        MockV3Aggregator sEUR_feed = new MockV3Aggregator(8, 108e6); // 1.08 USD
        MockV3Aggregator sGBP_feed = new MockV3Aggregator(8, 1.3e8);
        MockV3Aggregator sJPY_feed = new MockV3Aggregator(8, 0.007e8);

        vm.stopBroadcast();

        // Properly initialized arrays
        address[] memory collaterals = new address[](2);
        address[] memory priceFeedsCollateral = new address[](2);
        address[] memory priceFeedsSynthetic = new address[](4);
        TokenConfig[] memory tokenConfigs = new TokenConfig[](4);

        collaterals[0] = address(weth);
        collaterals[1] = address(wbtc);

        priceFeedsCollateral[0] = address(wethPriceFeed);
        priceFeedsCollateral[1] = address(wbtcPriceFeed);

        priceFeedsSynthetic[0] = sUSD_feed;
        priceFeedsSynthetic[1] = address(sEUR_feed);
        priceFeedsSynthetic[2] = address(sGBP_feed);
        priceFeedsSynthetic[3] = address(sJPY_feed);

        for (uint256 i = 0; i < tokenConfigs.length; i++) {
            tokenConfigs[i] = TokenConfig(50, 10, 18);
        }

        NetworkConfig memory config = NetworkConfig({
            collateralTokens: collaterals,
            priceFeedsCollateral: priceFeedsCollateral,
            priceFeedsSynthetic: priceFeedsSynthetic,
            weth: address(weth),
            wbtc: address(wbtc),
            deployerKey: vm.envUint("PRIVATE_KEY"),
            tokenConfigs: tokenConfigs
        });

        activeNetworkConfig = config;
        return config;
    }

    // Add this new function
    function getAnvilMockConfig() public returns (NetworkConfig memory) {
        vm.startBroadcast();

        ERC20Mock weth = new ERC20Mock("WETH", "WETH", address(this), 0);
        ERC20Mock wbtc = new ERC20Mock("WBTC", "WBTC", address(this), 0);

        MockV3Aggregator wethPriceFeed = new MockV3Aggregator(8, 1800e8);
        MockV3Aggregator wbtcPriceFeed = new MockV3Aggregator(8, 30000e8);

        MockV3Aggregator sEUR_feed = new MockV3Aggregator(8, 100e8);
        MockV3Aggregator sGBP_feed = new MockV3Aggregator(8, 130e8);
        MockV3Aggregator sJPY_feed = new MockV3Aggregator(8, 1e8);

        vm.stopBroadcast();

        address[] memory collaterals = new address[](2);
        address[] memory collateralFeeds = new address[](2);
        address[] memory syntheticFeeds = new address[](4);
        TokenConfig[] memory tokenConfigs = new TokenConfig[](4);

        collaterals[0] = address(weth);
        collaterals[1] = address(wbtc);

        collateralFeeds[0] = address(wethPriceFeed);
        collateralFeeds[1] = address(wbtcPriceFeed);

        syntheticFeeds[1] = address(sEUR_feed);
        syntheticFeeds[2] = address(sGBP_feed);
        syntheticFeeds[3] = address(sJPY_feed);

        for (uint256 i = 0; i < tokenConfigs.length; i++) {
            tokenConfigs[i] = TokenConfig(50, 10, 18);
        }

        return
            NetworkConfig({
                collateralTokens: collaterals,
                priceFeedsCollateral: collateralFeeds,
                priceFeedsSynthetic: syntheticFeeds,
                weth: address(weth),
                wbtc: address(wbtc),
                deployerKey: vm.envUint("PRIVATE_KEY"),
                tokenConfigs: tokenConfigs
            });
    }
}
