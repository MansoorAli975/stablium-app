// SPDX-License-Identifier: MIT
// Handler is going to narrow down the way we call functions.
// Purpose is to save and optimize the usge of our runs without wasting them.
pragma solidity ^0.8.18;

import {Test} from "forge-std/Test.sol";
import {STBEngine} from "../../src/STBEngine.sol";
import {Stablium} from "../../src/Stablium.sol";
import "@openzeppelin/contracts/mocks/ERC20Mock.sol";
import {MockV3Aggregator} from "../mocks/MockV3Aggregator.sol";

contract Handler is Test {
    STBEngine stbe;
    Stablium stb;
    ERC20Mock weth;
    ERC20Mock wbtc;
    uint256 public timesMintIsCalled;
    address[] public usersWithCollateralDeposited;
    MockV3Aggregator public ethUsdPriceFeed;
    uint256 MAX_DEPOSIT_SIZE = type(uint96).max;

    constructor(STBEngine _stbEngine, Stablium _stb) {
        stbe = _stbEngine;
        stb = _stb;

        address[] memory collateralTokens = stbe.getCollateralTokens();
        weth = ERC20Mock(collateralTokens[0]);
        wbtc = ERC20Mock(collateralTokens[1]);

        ethUsdPriceFeed = MockV3Aggregator(stbe.getCollateralTokenPriceFeed(address(weth)));
    }

    function mintStb(uint256 amount, uint256 addressSeed) public {
        if (usersWithCollateralDeposited.length == 0) {
            return;
        }

        address sender = usersWithCollateralDeposited[addressSeed % usersWithCollateralDeposited.length];
        (uint256 totalStbMinted, uint256 collateralValueInUsd) = stbe.getAccountInformation(sender);
        int256 maxStbToMint = (int256(collateralValueInUsd) / 2) - int256(totalStbMinted);
        if (maxStbToMint < 0) {
            return;
        }
        amount = bound(amount, 0, uint256(maxStbToMint));
        if (amount == 0) {
            return;
        }
        vm.startPrank(sender);
        stbe.mintStb(amount);
        vm.stopPrank();
        timesMintIsCalled++;
    }

    // redeem collateral
    function depositCollateral(uint256 collateralSeed, uint256 amountCollateral) public {
        ERC20Mock collateral = _getCollateralFromSeed(collateralSeed);
        amountCollateral = bound(amountCollateral, 1, MAX_DEPOSIT_SIZE);

        vm.startPrank(msg.sender);
        collateral.mint(msg.sender, amountCollateral);
        collateral.approve(address(stbe), amountCollateral);
        stbe.depositCollateral(address(collateral), amountCollateral);
        vm.stopPrank();
        //double push?
        usersWithCollateralDeposited.push(msg.sender);
    }

    function redeemCollateral(uint256 collateralSeed, uint256 amountCollateral) public {
        ERC20Mock collateral = _getCollateralFromSeed(collateralSeed);
        uint256 maxCollateralToRedeem = stbe.getCollateralBalanceOfUser(address(collateral), msg.sender);
        amountCollateral = bound(amountCollateral, 0, maxCollateralToRedeem);
        if (amountCollateral == 0) {
            return;
        }
        stbe.redeemCollateral(address(collateral), amountCollateral);
    }

    ////THIS BREAKS OUR VARIANT TEST SUIT///

    // function updateCollateralPrice(uint96 newPrice) public {
    //     int256 newPriceInt = int256(uint256(newPrice));
    //     ethUsdPriceFeed.updateAnswer(newPriceInt);
    // }

    // helper functions
    function _getCollateralFromSeed(uint256 collateralSeed) private view returns (ERC20Mock) {
        if (collateralSeed % 2 == 0) {
            return weth;
        }
        return wbtc;
    }
}
