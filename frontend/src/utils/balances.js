// src/utils/balances.js
import { ethers } from "ethers";
import { getForexEngineContract } from "./contract";

const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
];

const RPC_URL = import.meta?.env?.VITE_RPC_URL || "";
const ENV_WETH = import.meta?.env?.VITE_WETH_ADDRESS || null;
// Sepolia WETH (Chainlink mock commonly used)
const DEFAULT_WETH = "0xdd13E55209Fd76AfE204dBda4007C227904f0a81";

function makeReadProvider(signer) {
    // Prefer the wallet provider if we have a signer (fewer env pitfalls)
    if (signer?.provider) return signer.provider;
    return RPC_URL ? new ethers.JsonRpcProvider(RPC_URL) : null;
}

async function safeTokenMeta(provider, token) {
    const erc = new ethers.Contract(token, ERC20_ABI, provider);
    let symbol = "TOKEN";
    let decimals = 18;
    try { symbol = await erc.symbol(); } catch { }
    try { decimals = await erc.decimals(); } catch { }
    return { symbol, decimals };
}

export function formatTokenAmount(valueBN, decimals = 18) {
    try {
        const s = ethers.formatUnits(valueBN ?? 0n, decimals);
        const n = Number(s);
        if (!Number.isFinite(n)) return "0.00";
        return n.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
        });
    } catch {
        return "0.00";
    }
}

/**
 * Fetch a snapshot of collateral for the user.
 * - Resolves WETH like: engine.getWeth() → VITE_WETH_ADDRESS → DEFAULT_WETH
 * - Reads on-chain with engine.getCollateralBalance(user, token)
 * - Returns [{ token, symbol, decimals, deposited }]
 */
export async function fetchCollateralSnapshot(user, signer /* optional */) {
    if (!user) return [];

    const provider = makeReadProvider(signer);
    if (!provider) return []; // no RPC or wallet provider available

    const engine = getForexEngineContract(provider);

    // Resolve which WETH the engine uses (best source of truth)
    let wethAddr = null;
    try {
        const fromEngine = await engine.getWeth();
        if (fromEngine && fromEngine !== ethers.ZeroAddress) {
            wethAddr = fromEngine;
        }
    } catch {
        // ignore; not all deployments had getWeth early on
    }
    if (!wethAddr) wethAddr = ENV_WETH || DEFAULT_WETH;

    const tokens = [wethAddr];

    const out = [];
    await Promise.all(
        tokens.map(async (token) => {
            try {
                // This is the correct public getter that mirrors s_collateralDeposited[user][token]
                const deposited = await engine.getCollateralBalance(user, token);
                console.log("[BALANCES] user:", user);
                console.log("[BALANCES] token (WETH):", token);
                console.log("[BALANCES] deposited (raw wei):", deposited?.toString?.());
                // meta + push
                const meta = await safeTokenMeta(provider, token);
                out.push({
                    token,
                    symbol: meta.symbol || "WETH",
                    decimals: meta.decimals ?? 18,
                    deposited: deposited ?? 0n,
                });
            } catch {
                // If the engine doesn't recognize the token, still show 0 for UI stability
                const meta = await safeTokenMeta(provider, token);
                out.push({
                    token,
                    symbol: meta.symbol || "WETH",
                    decimals: meta.decimals ?? 18,
                    deposited: 0n,
                });
            }
        })
    );

    return out;
}
