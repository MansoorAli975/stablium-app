// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/*
 * @title               SyntheticUSD
 * @author              Mansoor Ali
 * Collateral:          Exogenous (ETH & BTC)
 * Minting:             Algorithmic
 * Relative Stability:  Pegged to USD
 *
 * This is the contract meant to be governed by ForexEngine.
 * This contract represents a synthetic currency token within our forex trading protocol. 
    Minting and burning are managed by the ForexEngine contract.
 */

contract SyntheticUSD is ERC20Burnable, Ownable {
    error SyntheticUSD__MustBeMoreThanZero();
    error SyntheticUSD__BurnAmountExceedsBalance();
    error SyntheticUSD__NotZeroAddress();

    constructor() ERC20("SyntheticUSD", "sUSD") {}

    // Indirect user burn path via ForexEngine. OnlyOwner burn not used for normal users.
    function burn(uint256 _amount) public override onlyOwner {
        uint256 balance = balanceOf(msg.sender);
        if (_amount <= 0) {
            revert SyntheticUSD__MustBeMoreThanZero();
        }
        if (balance < _amount) {
            revert SyntheticUSD__BurnAmountExceedsBalance();
        }
        super.burn(_amount);
    }

    function mint(
        address _to,
        uint256 _amount
    ) external onlyOwner returns (bool) {
        if (_to == address(0)) {
            revert SyntheticUSD__NotZeroAddress();
        }
        if (_amount <= 0) {
            revert SyntheticUSD__MustBeMoreThanZero();
        }
        _mint(_to, _amount);
        return true;
    }
}
