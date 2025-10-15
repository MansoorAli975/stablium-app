// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ForexEngine} from "src/ForexEngine.sol";

interface IFeed {
    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80);
}

contract ClosePos4Fork is Test {
    ForexEngine engine;
    address trader;

    function setUp() public {
        // Fork Sepolia from .env
        vm.createSelectFork(vm.envString("SEPOLIA_RPC_URL"), 9417806);
        engine = ForexEngine(payable(vm.envAddress("ENGINE_ADDRESS")));
        trader = vm.envAddress("TRADER");
    }

    /// @dev Detect Panic(uint256) with code 0x11 (arithmetic) in generic revert data.
    function _isArithmeticPanic(
        bytes memory data
    ) internal pure returns (bool) {
        // layout: 4 bytes selector (0x4e487b71), then 32 bytes panic code
        if (data.length < 36) return false;

        bytes4 sel;
        uint256 code;
        assembly {
            // first 32 bytes of data payload start at data+32
            // keep the first 4 bytes (selector) -> shift right by 224 bits
            sel := shr(224, mload(add(data, 32)))
            // next 32 bytes start at offset +36 (skip 4 bytes selector)
            code := mload(add(data, 36))
        }
        return (sel == 0x4e487b71 && code == 0x11);
    }

    //
    function test_engineSanity() public view {
        address eng = vm.envAddress("ENGINE_ADDRESS");
        // 1) Engine contract must have code on the fork
        assertGt(eng.code.length, 0, "ENGINE_ADDRESS has no code on fork");

        // 2) EUR feed must be configured (non-zero)
        address eurFeed = engine.getSyntheticPriceFeed("EUR"); // use pre-cast engine
        assertTrue(eurFeed != address(0), "EUR feed is zero");
    }

    //
    function testClosePosition4() public {
        // Make price fresh so closePosition() doesn't revert with StalePrice
        address eurFeed = engine.getSyntheticPriceFeed("EUR");
        (, , , uint256 updatedAt, ) = IFeed(eurFeed).latestRoundData();
        vm.warp(updatedAt + 1);

        // Determine a slippage guard based on position direction
        ForexEngine.Position[] memory ps = engine.getAllUserPositions(trader);
        uint256 idx = 4;
        require(ps.length > idx, "No position at index 4");
        uint256 guard = ps[idx].isLong ? uint256(0) : type(uint256).max;

        // Low-level call so we can inspect revert data precisely
        vm.startPrank(trader);
        (bool ok, bytes memory ret) = address(engine).call(
            abi.encodeWithSelector(engine.closePosition.selector, idx, guard)
        );
        vm.stopPrank();

        // If it reverted, assert it's NOT the arithmetic panic (0x11) we fixed.
        if (!ok) {
            bool isArith = _isArithmeticPanic(ret);
            assertFalse(
                isArith,
                "should not revert with arithmetic panic (0x11)"
            );
            // Optional debugging:
            // console2.logBytes(ret);
        }
        // If it succeeded, great — confirms no arithmetic panic as well.
    }
}
