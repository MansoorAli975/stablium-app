// SPDX-License-Identifier: MIT
// This file has our varinats / properties.
// What are our variants?
//   1. The total supply of DSC should be less than the total value of collateral.
//   2. Getter view functions should never revert.

pragma solidity ^0.8.18;
import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {DeployDSC} from "../../script/DeployDSC.s.sol";
import {DSCEngine} from "../../src/DSCEngine.sol";


contract InvariantsTest is StdInvariant, Test {

DeployDSC deployer;
DSCEngine dsce;
    // function setUp() external {

    //     deployer = new DeployDSC();
    //     dsce = deployer.run();
    // }

}