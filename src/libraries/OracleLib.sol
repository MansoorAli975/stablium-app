// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "../../lib/chainlink-brownie-contracts/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

/*
 * @title OracleLib
 * @author Mansoor Ali
 * @notice This library is used to check the Chainlink Oracle for stale data.
 * If a pricce is stale, the function will revert and render DSCEngine unusable
 * This is by desigh
 * We want the DSCEngine to freeze if prices become stale.
*/

library OracleLib {
error OracleLib_StalePrice();

uint256 private constant TIMEOUT = 3 hours;

function staleCheckLatestRoundData(AggregatorV3Interface priceFeed) public view returns(uint80, int256, uint256,
uint256, uint80){
   
   (uint80 roundId,
   int256 answer,
   uint256 startedAt,
   uint256 updatedAt,
   uint80 answeredInRound
   ) = priceFeed.latestRoundData();

   uint256 secondsSince = block.timestamp - updatedAt;
   if (secondsSince > TIMEOUT) revert OracleLib_StalePrice();
   return (roundId, answer, startedAt,updatedAt, answeredInRound);
}

}