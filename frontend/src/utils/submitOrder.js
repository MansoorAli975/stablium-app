// src/utils/submitOrder.js
import { ethers } from "ethers";
import { getForexEngineContract } from "./contract";
import { toFeedUnits, to1e18, validateTpSl } from "./tpsl";

const FEED_ABI = [
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    "function decimals() view returns (uint8)",
];

/**
 * Submit an order with exact TP/SL the user typed (buffer is 0 on-chain).
 * @param {Object} p
 * @param {string} p.base            e.g. "GBP" (the base in pair BASE/USD)
 * @param {boolean} p.isLong
 * @param {bigint|string} p.marginWei   collateral amount (token units, e.g. WETH wei)
 * @param {number} p.leverage
 * @param {string} [p.tpStr]         TP typed in UI (e.g. "1.3654") or ""/undefined
 * @param {string} [p.slStr]         SL typed in UI (e.g. "1.3594") or ""/undefined
 * @param {number} [p.maxSlippageBps=0]
 */
export async function submitOrder({
    base,
    isLong,
    marginWei,
    leverage,
    tpStr,
    slStr,
    maxSlippageBps = 0,
}) {
    if (!window.ethereum) throw new Error("No wallet (window.ethereum) found");

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const engine = getForexEngineContract(signer);

    // 1) Resolve feed + entry & decimals
    const feedAddr = await engine.getSyntheticPriceFeed(base);
    if (!feedAddr || feedAddr === ethers.ZeroAddress) {
        throw new Error(`No price feed for ${base}`);
    }

    const feed = new ethers.Contract(feedAddr, FEED_ABI, provider);
    const [, entryRaw, , updatedAt] = await feed.latestRoundData();
    if (!updatedAt) throw new Error("No oracle price");
    const dec = await feed.decimals();

    // 2) Convert UI numbers -> feed units (exact) and to 1e18 for validation
    const tpFeed = toFeedUnits(tpStr, dec); // 0n if empty/invalid
    const slFeed = toFeedUnits(slStr, dec); // 0n if empty/invalid

    const entry1e18 = to1e18(BigInt(entryRaw), dec);
    const tp1e18 = tpFeed > 0n ? to1e18(tpFeed, dec) : 0n;
    const sl1e18 = slFeed > 0n ? to1e18(slFeed, dec) : 0n;

    // 3) Read MIN_PRICE_MOVEMENT (fallback 5 bps if not exposed)
    let minMove = 5;
    try { minMove = Number(await engine.MIN_PRICE_MOVEMENT()); } catch { }

    // 4) Validate TP/SL against contract rules (no buffer)
    const v = validateTpSl({
        isLong,
        entry1e18,
        tp1e18,
        sl1e18,
        MIN_PRICE_MOVEMENT_BPS: minMove,
    });
    if (!v.ok) throw new Error(v.errors.join("\n"));

    // 5) Send tx — pass exactly the feed-unit prices the user typed
    const tx = await engine.openPosition(
        base,
        isLong,
        typeof marginWei === "bigint" ? marginWei : BigInt(marginWei),
        leverage,
        tpFeed,
        slFeed,
        maxSlippageBps
    );
    const receipt = await tx.wait();

    // Nudge UI to refetch
    window.dispatchEvent(new CustomEvent("engine:refresh"));

    return { hash: tx.hash, receipt };
}
