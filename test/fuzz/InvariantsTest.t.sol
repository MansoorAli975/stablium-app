// SPDX-License-Identifier: MIT
// This file has our varinats / properties.
// What are our variants?
//   1. The total supply of STB should be less than the total value of collateral.
//   2. Getter view functions should never revert.

pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {DeploySTB} from "../../script/DeploySTB.s.sol";
import {STBEngine} from "../../src/STBEngine.sol";
import {Stablium} from "../../src/Stablium.sol";
import {HelperConfig} from "../../script/HelperConfig.s.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Handler} from "./Handler.t.sol";
import {console} from "forge-std/console.sol";

contract InvariantsTest is StdInvariant, Test {
    DeploySTB deployer;
    STBEngine stbe;
    Stablium stb;
    HelperConfig config;
    address weth;
    address wbtc;
    Handler handler;

    function setUp() external {
        deployer = new DeploySTB();
        (stb, stbe, config) = deployer.run();
        (,, weth, wbtc,) = config.activeNetworkConfig();
        //targetContract(address(stbe));
        handler = new Handler(stbe, stb);
        targetContract(address(handler));
    }

    function invariant_protocolMustHaveMoreValueThanTotalSupply() public view {
        uint256 totalSupply = stb.totalSupply();
        uint256 totalWethDeposited = IERC20(weth).balanceOf(address(stbe));
        uint256 totalBtcDeposited = IERC20(wbtc).balanceOf(address(stbe));

        uint256 wethValue = stbe.getUsdValue(weth, totalWethDeposited);
        uint256 wbtcValue = stbe.getUsdValue(wbtc, totalBtcDeposited);

        console.log("weth value: ", wethValue);
        console.log("wbtc value: ", wbtcValue);
        console.log("total supply: ", totalSupply);
        console.log("Times mint called: ", handler.timesMintIsCalled());

        assert(wethValue + wbtcValue >= totalSupply);
    }

    function invariant_gettersShouldNotRevert() public view {
        stbe.getLiquidationBonus();
        stbe.getPrecision();
        stbe.getAdditionalFeedPrecision();
        stbe.getLiquidationThreshold();
        stbe.getLiquidationPrecision();
        stbe.getMinHealthFactor();
        stbe.getCollateralTokens();
        stbe.getStb();
    }
}
