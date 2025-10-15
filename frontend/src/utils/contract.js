// src/utils/contract.js
import { ethers } from "ethers";
import artifact from "../../../out/ForexEngine.sol/ForexEngine.json";
import { ENGINE_ADDRESS, RPC_URL } from "../config/engine";

// Single source of truth
export const FOREX_ENGINE_ADDRESS = ENGINE_ADDRESS;
export const FOREX_ENGINE_ABI = artifact.abi;

/**
 * Default provider:
 * - If VITE_RPC_URL is set, use JsonRpcProvider
 * - Else, fall back to window.ethereum (BrowserProvider)
 */
export function getDefaultProvider() {
    if (RPC_URL && typeof RPC_URL === "string" && RPC_URL.length > 0) {
        return new ethers.JsonRpcProvider(RPC_URL);
    }
    if (typeof window !== "undefined" && window.ethereum) {
        return new ethers.BrowserProvider(window.ethereum);
    }
    throw new Error("No provider available. Set VITE_RPC_URL or install a wallet.");
}

/**
 * Returns a ForexEngine contract instance connected to a provider or signer.
 * If none is passed, it uses getDefaultProvider().
 */
export function getForexEngineContract(providerOrSigner) {
    const conn = providerOrSigner ?? getDefaultProvider();
    return new ethers.Contract(FOREX_ENGINE_ADDRESS, FOREX_ENGINE_ABI, conn);
}

/**
 * Helper to compute a safe minExitPrice guard for closePosition(index, priceBound).
 *  - long  -> 0n          (accept any oracle price >= 0)
 *  - short -> MaxUint256  (accept any oracle price <= Max)
 */
export async function getCloseGuard(engine, user, index) {
    const ps = await engine.getAllUserPositions(user);
    return ps[index]?.isLong ? 0n : ethers.MaxUint256;
}
