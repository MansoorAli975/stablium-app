// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;
import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";


/*
 * @title               DecentralizedStableCoin
 * @author              Mansoor Ali
 * Collateral:          Exogenous (ETH & BTC)
 * Minting:             Algorithmic
 * Relative Stability:  Pegged to USD
 *
 * This is the contract meant to be governed by DSCEngine. 
 * This contract is just ERC20 implementation of our stablecoin system.
*/

contract DecentralizedStableCoin is ERC20Burnable {
    constructor() ERC20("DecentralizedStableCoin", "DSC") {
        
    
    }
}