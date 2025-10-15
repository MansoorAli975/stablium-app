// src/utils/tpsl.js
import { ethers } from "ethers";

// ---- scaling helpers ----
export function toFeedUnits(uiStr, feedDecimals) {
    if (!uiStr) return 0n;
    const s = String(uiStr).trim();
    if (!s) return 0n;
    return BigInt(ethers.parseUnits(s, feedDecimals));
}
export function to1e18(feedBig, feedDecimals) {
    const d = Number(feedDecimals);
    if (d === 18) return feedBig;
    return d < 18 ? feedBig * 10n ** BigInt(18 - d) : feedBig / 10n ** BigInt(d - 18);
}

// bps difference between two 1e18 prices
function bpsDiff(entry1e18, price1e18) {
    if (entry1e18 <= 0n) return 0;
    const diff = (price1e18 > entry1e18) ? (price1e18 - entry1e18) : (entry1e18 - price1e18);
    return Number((diff * 10000n) / entry1e18);
}

/**
 * Validate TP/SL against contract rules.
 * entry1e18, tp1e18, sl1e18 are BigInt in 1e18.
 * MIN_PRICE_MOVEMENT_BPS defaults to 5 (0.05%).
 */
export function validateTpSl({ isLong, entry1e18, tp1e18, sl1e18, MIN_PRICE_MOVEMENT_BPS = 5 }) {
    const out = { ok: true, errors: [] };

    if (isLong) {
        if (tp1e18 > 0n && !(tp1e18 > entry1e18)) out.errors.push("TP must be > entry for a long.");
        if (sl1e18 > 0n && !(sl1e18 < entry1e18)) out.errors.push("SL must be < entry for a long.");
        if (tp1e18 > 0n && bpsDiff(entry1e18, tp1e18) < MIN_PRICE_MOVEMENT_BPS) out.errors.push("TP too close to entry.");
        if (sl1e18 > 0n && bpsDiff(entry1e18, sl1e18) < MIN_PRICE_MOVEMENT_BPS) out.errors.push("SL too close to entry.");
        if (tp1e18 > 0n && sl1e18 > 0n && !(sl1e18 < tp1e18)) out.errors.push("SL must be < TP for a long.");
    } else {
        if (tp1e18 > 0n && !(tp1e18 < entry1e18)) out.errors.push("TP must be < entry for a short.");
        if (sl1e18 > 0n && !(sl1e18 > entry1e18)) out.errors.push("SL must be > entry for a short.");
        if (tp1e18 > 0n && bpsDiff(entry1e18, tp1e18) < MIN_PRICE_MOVEMENT_BPS) out.errors.push("TP too close to entry.");
        if (sl1e18 > 0n && bpsDiff(entry1e18, sl1e18) < MIN_PRICE_MOVEMENT_BPS) out.errors.push("SL too close to entry.");
        if (tp1e18 > 0n && sl1e18 > 0n && !(sl1e18 > tp1e18)) out.errors.push("SL must be > TP for a short.");
    }

    out.ok = out.errors.length === 0;
    return out;
}
