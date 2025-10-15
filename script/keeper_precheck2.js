// script/keeper_precheck2.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

const BASE = "GBP";
const QUOTE = "USD";
// From your tuple: TP = 136207000 (8 dp)
const TP_FEED = 136_207_000n;

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function fmt(n, dp) {
    const s = BigInt(n).toString().padStart(dp + 1, "0");
    return s.slice(0, -dp) + "." + s.slice(-dp);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    // params
    const [buf, tick] = await Promise.all([
        c.priceTriggerBuffer(),
        c.MIN_PRICE_MOVEMENT(),
    ]);

    // feed decimals for formatting
    const feedAddr = await c.getSyntheticPriceFeed(BASE);
    const f = new ethers.Contract(feedAddr, [
        "function decimals() view returns (uint8)",
        "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
    ], p);
    const dp = Number(await f.decimals());

    // what the ENGINE sees right now
    const derived = await c.getDerivedPrice(BASE, QUOTE); // usually scaled to feed dp
    const threshold = TP_FEED + BigInt(buf);              // LONG: price must be >= TP + buffer

    console.log(`tick=${tick.toString()}  buffer=${buf.toString()} (feed units)`);
    console.log(`TP=${TP_FEED.toString()} (${fmt(TP_FEED, dp)})  threshold=${threshold.toString()} (${fmt(threshold, dp)})`);
    console.log(`ENGINE getDerivedPrice(${BASE}/${QUOTE}) = ${derived.toString()} (${fmt(derived, dp)})`);

    const meets = BigInt(derived) >= threshold;
    console.log(`meetsTrigger? ${meets ? "YES" : "NO"}`);
})();
