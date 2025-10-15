// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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
        NetworkConfig memory cfg;

        // --- Collateral: ONLY WETH on Sepolia ---
        // Initialize with correct length (1 element)
        cfg.collateralTokens = new address[](1);
        cfg.collateralTokens[0] = 0xdd13E55209Fd76AfE204dBda4007C227904f0a81; // WETH (Sepolia)

        // Initialize with correct length (1 element)
        cfg.priceFeedsCollateral = new address[](1);
        cfg.priceFeedsCollateral[0] = 0x694AA1769357215DE4FAC081bf1f309aDC325306; // ETH/USD (Chainlink Sepolia)

        // --- Synthetic price feeds (EUR/USD, GBP/USD, JPY/USD on Sepolia) ---
        // Initialize with correct length (3 elements)
        cfg.priceFeedsSynthetic = new address[](3);
        cfg.priceFeedsSynthetic[0] = 0x1a81afB8146aeFfCFc5E50e8479e826E7D55b910; // EUR/USD
        cfg.priceFeedsSynthetic[1] = 0x91FAB41F5f3bE955963a986366edAcff1aaeaa83; // GBP/USD
        cfg.priceFeedsSynthetic[2] = 0x8A6af2B75F23831ADc973ce6288e5329F63D86c6; // JPY/USD

        // --- Token configs (same defaults for each synthetic) ---
        // Initialize with correct length (3 elements for 3 synthetics)
        cfg.tokenConfigs = new TokenConfig[](3);
        for (uint256 i = 0; i < cfg.tokenConfigs.length; i++) {
            cfg.tokenConfigs[i] = TokenConfig({liquidationThreshold: 50, bonus: 10, decimals: 18});
        }

        // --- Other fields ---
        cfg.weth = cfg.collateralTokens[0];
        cfg.wbtc = address(0); // not used on Sepolia
        cfg.deployerKey = vm.envUint("PRIVATE_KEY");

        return cfg;
    }
}
