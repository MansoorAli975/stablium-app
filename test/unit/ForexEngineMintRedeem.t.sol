// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {Test, console} from "forge-std/Test.sol";
import {DeployForex} from "../../script/DeployForex.s.sol";
import {ForexEngine} from "../../src/ForexEngine.sol";
import {SyntheticUSD} from "../../src/SyntheticUSD.sol";
import {ERC20Mock} from "@openzeppelin/contracts/mocks/ERC20Mock.sol";

contract ForexEngineMintRedeemTest is Test {
    ForexEngine public engine;
    SyntheticUSD public sUSD;
    ERC20Mock public weth;
    address public user = address(1);
    uint256 public mintAmount = 10 ether;

    function setUp() public {
        // Deploy all contracts using your script
        DeployForex deployScript = new DeployForex();
        DeployForex.Deployment memory deployed = deployScript.run();
        ForexEngine deployedEngine = deployed.engine;
        SyntheticUSD deployedSUSD = deployed.sUSD;

        engine = deployedEngine;
        sUSD = deployedSUSD;

        // Use WETH as collateral — from the engine
        weth = ERC20Mock(engine.getCollateralTokens()[0]);

        // Give test user some WETH
        deal(address(weth), user, 100 ether);
    }

    function testUserCanDepositAndMint() public {
        vm.startPrank(user);

        // Approve WETH to the engine
        weth.approve(address(engine), mintAmount);

        // Mint sUSD using WETH
        // engine.depositCollateralAndMint(address(weth), mintAmount, "sUSD");

        engine.depositCollateral(address(weth), mintAmount);
        engine.mintSyntheticToken("sUSD", mintAmount);

        // Check user's sUSD balance
        uint256 sUSDBalance = sUSD.balanceOf(user);
        assertGt(sUSDBalance, 0, "User should have received sUSD");

        // Check engine's WETH balance
        uint256 wethInEngine = weth.balanceOf(address(engine));
        assertEq(wethInEngine, mintAmount, "Engine should have received WETH");

        vm.stopPrank();
    }

    function testUserCanRedeemAndWithdraw() public {
        vm.startPrank(user);

        // Approve and mint first
        weth.approve(address(engine), mintAmount);
        // engine.depositCollateralAndMint(address(weth), mintAmount, "sUSD");
        engine.depositCollateral(address(weth), mintAmount);
        engine.mintSyntheticToken("sUSD", mintAmount);

        // Approve sUSD to engine
        uint256 userSUSDBalance = sUSD.balanceOf(user);
        sUSD.approve(address(engine), userSUSDBalance);

        // Redeem sUSD
        engine.burnSyntheticToken("sUSD", userSUSDBalance);
        engine.redeemCollateral(address(weth), mintAmount);

        // Check final balances
        assertEq(
            sUSD.balanceOf(user),
            0,
            "User should have 0 sUSD after redeem"
        );
        assertEq(
            weth.balanceOf(user),
            100 ether,
            "User should have full WETH back"
        );

        vm.stopPrank();
    }
}
