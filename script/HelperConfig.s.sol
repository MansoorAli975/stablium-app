// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Script} from "forge-std/Script.sol";
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

    function getNetworkConfig() public view returns (NetworkConfig memory) {
        // Initialize arrays with proper lengths
        address[] memory collaterals = new address[](2);
        address[] memory collateralFeeds = new address[](2);
        address[] memory syntheticFeeds = new address[](3);
        TokenConfig[] memory configs = new TokenConfig[](3);

        // Sepolia: Collateral tokens
        collaterals[0] = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81; // WETH
        collaterals[1] = 0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063; // WBTC

        // Sepolia: Collateral price feeds
        collateralFeeds[0] = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // WETH/USD
        collateralFeeds[1] = 0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43; // WBTC/USD

        // Sepolia: Synthetic token price feeds
        syntheticFeeds[0] = 0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910; // EUR/USD
        syntheticFeeds[1] = 0x91FAB41F5f3bE955963a986366edAcff1aaeaa83; // GBP/USD
        syntheticFeeds[2] = 0x8A6af2B75F23831ADc973ce6288e5329F63D86c6; // JPY/USD

        // Token configurations (same for all synthetics)
        for (uint256 i = 0; i < configs.length; i++) {
            configs[i] = TokenConfig({
                liquidationThreshold: 50,
                bonus: 10,
                decimals: 18
            });
        }

        return
            NetworkConfig({
                collateralTokens: collaterals,
                priceFeedsCollateral: collateralFeeds,
                priceFeedsSynthetic: syntheticFeeds,
                weth: collaterals[0],
                wbtc: collaterals[1],
                deployerKey: vm.envUint("PRIVATE_KEY"),
                tokenConfigs: configs
            });
    }
}
