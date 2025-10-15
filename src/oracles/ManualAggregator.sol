// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {AggregatorV3Interface} from "../../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract ManualAggregator is AggregatorV3Interface, Ownable {
    uint8 private constant DECIMALS = 8; // match Chainlink FX feeds (1e8)
    uint80 private _roundId;
    int256 private _answer; // e.g., EUR/USD * 1e8
    uint256 private _updatedAt;

    struct Round {
        int256 answer;
        uint256 updatedAt;
    }

    mapping(uint80 => Round) private _rounds;

    event AnswerUpdated(
        int256 indexed current,
        uint256 indexed roundId,
        uint256 updatedAt
    );

    // ---- AggregatorV3Interface ----
    function decimals() external pure override returns (uint8) {
        return DECIMALS;
    }

    function description() external pure override returns (string memory) {
        return "Manual Oracle";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function getRoundData(
        uint80 rid
    )
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round memory r = _rounds[rid];
        require(r.updatedAt != 0, "No data");
        return (rid, r.answer, r.updatedAt, r.updatedAt, rid);
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        require(_updatedAt != 0, "No data");
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    // ---- Admin ----
    function setPrice(int256 newPrice) external onlyOwner {
        require(newPrice > 0, "bad price");
        _roundId += 1;
        _answer = newPrice;
        _updatedAt = block.timestamp;
        _rounds[_roundId] = Round(newPrice, _updatedAt);
        emit AnswerUpdated(newPrice, _roundId, _updatedAt);
    }
}
