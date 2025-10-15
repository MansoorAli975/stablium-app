// src/utils/erc20.js
import { ethers } from "ethers";

export const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)"
];

export function getErc20(tokenAddress, providerOrSigner) {
    return new ethers.Contract(tokenAddress, ERC20_ABI, providerOrSigner);
}
