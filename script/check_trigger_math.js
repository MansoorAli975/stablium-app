// script/check_trigger_math.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76"; // trader
const UI = 16; // UI index

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function fmt(n, dp) {
    const s = BigInt(n).toString().padStart(dp + 1, "0");
    return s.slice(0, -dp) + "." + s.slice(-dp);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    const [buf, tick] = await Promise.all([
        c.priceTriggerBuffer(),    // feed units
        c.MIN_PRICE_MOVEMENT(),    // feed units
    ]);

    // Get GBP feed decimals
    const gbpFeed = await c.getSyntheticPriceFeed("GBP");
    const f = new ethers.Contract(gbpFeed, [
        "function decimals() view returns (uint8)",
        "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
    ], p);
    const dp = Number(await f.decimals());

    // Get user's positions & pick UI index 16
    const all = await c.getAllUserPositions(USER);
    if (UI >= all.length) {
        console.log(`User has only ${all.length} positions; no index ${UI}.`);
        return;
    }
    const pos = all[UI];

    // Show the raw tuple so we confirm fields
    console.log(`positions[${UI}] raw:`);
    console.log(pos);

    // Heuristics: find TP/SL/isLong in the tuple
    // - TP/SL are ~8dp feed numbers around 1e8 scale
    // - isLong is a boolean in the tuple
    let isLong = false;
    for (const [k, v] of Object.entries(pos)) {
        if (!isNaN(+k)) {
            if (typeof v === "boolean") isLong = v || isLong;
        }
    }
    // scan numeric words to locate TP/SL by proximity to 1e8
    const nums = [];
    for (const [k, v] of Object.entries(pos)) {
        if (!isNaN(+k) && typeof v === "bigint") nums.push(v);
    }
    const near1e8 = nums.filter(n => n > 10_000n && n < 2_000_000_000n); // rough band
    near1e8.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    // Guess: TP is the larger of the two close-together near-1e8 numbers; SL the smaller
    let TP = null, SL = null;
    for (let i = 0; i < near1e8.length - 1; i++) {
        const a = near1e8[i], b = near1e8[i + 1];
        if (b - a < 10_000_000n) { // within ~0.1 in price; heuristic window
            TP = b; SL = a;
        }
    }
    if (!TP || !SL) {
        // Fallback to known values from your notes
        TP = 136_207_000n;
        SL = 116_207_000n;
    }

    // Engine price in 1e18; convert to feed units = (derived * 10^dp) / 1e18
    const derived1e18 = await c.getDerivedPrice("GBP", "USD");
    const feedUnits = (derived1e18 * BigInt(10 ** dp)) / 1_000_000_000_000_000_000n;

    const threshold = TP + BigInt(buf); // LONG: >= TP + buffer
    console.log(`\nisLong=${isLong}`);
    console.log(`tick=${tick.toString()}  buffer=${buf.toString()}  dp=${dp}`);
    console.log(`TP=${TP.toString()} (${fmt(TP, dp)})  SL=${SL.toString()} (${fmt(SL, dp)})`);
    console.log(`engine derived (1e18)=${derived1e18.toString()}`);
    console.log(`engine price (feed units)=${feedUnits.toString()} (${fmt(feedUnits, dp)})`);
    console.log(`threshold (TP+buf)=${threshold.toString()} (${fmt(threshold, dp)})`);
    console.log(`meets? ${isLong ? (feedUnits >= threshold) : (feedUnits <= threshold)}`);

    // Also try manual close (static) from owner with a permissive bound for LONG
    try {
        const r = await c.closePosition.staticCall(UI, ethers.MaxUint256, { from: USER });
        console.log("\nclosePosition.static(UI, MaxUint256) →", r);
    } catch (e) {
        console.log("\nclosePosition.static(UI, MaxUint256) revert →", e?.reason || e?.shortMessage || e?.message);
    }

    // And keeper static from owner context
    try {
        const r2 = await c.checkTpSlAndClose.staticCall(UI, { from: USER });
        console.log("checkTpSlAndClose.static(UI) →", r2);
    } catch (e) {
        console.log("checkTpSlAndClose.static(UI) revert →", e?.reason || e?.shortMessage || e?.message);
    }
})();
