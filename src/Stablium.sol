// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import {ERC20Burnable, ERC20} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/*
 * @title               Stablium
 * @author              Mansoor Ali
 * Collateral:          Exogenous (ETH & BTC)
 * Minting:             Algorithmic
 * Relative Stability:  Pegged to USD
 *
 * This is the contract meant to be governed by STBEngine.
 * This contract is just ERC20 implementation of our stablecoin system.
 */

contract Stablium is ERC20Burnable, Ownable {
    error Stablium__MustBeMoreThanZero();
    error Stablium__BurnAmountExceedsBalance();
    error Stablium__NotZeroAddress();

    constructor() ERC20("Stablium", "STB") {}

    // Indirect user burn path via STBEngine. OnlyOwner burn not used for normal users.
    function burn(uint256 _amount) public override onlyOwner {
        uint256 balance = balanceOf(msg.sender);
        if (_amount <= 0) {
            revert Stablium__MustBeMoreThanZero();
        }
        if (balance < _amount) {
            revert Stablium__BurnAmountExceedsBalance();
        }
        super.burn(_amount);
    }

    function mint(
        address _to,
        uint256 _amount
    ) external onlyOwner returns (bool) {
        if (_to == address(0)) {
            revert Stablium__NotZeroAddress();
        }
        if (_amount <= 0) {
            revert Stablium__MustBeMoreThanZero();
        }
        _mint(_to, _amount);
        return true;
    }
}
