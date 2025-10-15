// script/sweep_close_bounds.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76"; // trader/owner
const UI = 16n; // your UI index

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function toDec(n, dp) {
    const s = BigInt(n).toString().padStart(dp + 1, "0");
    return s.slice(0, -dp) + "." + s.slice(-dp);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    // current engine price
    const px1e18 = await c.getDerivedPrice("GBP", "USD");

    // feed decimals
    const gbpFeed = await c.getSyntheticPriceFeed("GBP");
    const f = new ethers.Contract(gbpFeed, [
        "function decimals() view returns (uint8)",
        "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
    ], p);
    const dp = Number(await f.decimals());
    const feedUnits = (px1e18 * 10n ** BigInt(dp)) / 10n ** 18n;

    console.log("engine price 1e18 =", px1e18.toString());
    console.log("engine price feed =", feedUnits.toString(), `(${toDec(feedUnits, dp)}) dp=${dp}`);

    // candidate bounds around both interpretations
    const FEED_NEAR = [-1000n, -100n, -10n, -5n, 0n, 5n, 10n, 100n, 1000n].map(d => feedUnits + d);
    const FEED_WIDE = [feedUnits / 2n, (feedUnits * 9n) / 10n, feedUnits, (feedUnits * 11n) / 10n, feedUnits * 2n];

    const ONE18_NEAR = [-10_000_000_000_000n, -1_000_000_000_000n, -100_000_000_000n, 0n,
        100_000_000_000n, 1_000_000_000_000n, 10_000_000_000_000n]
        .map(d => px1e18 + d);
    const ONE18_WIDE = [px1e18 / 2n, (px1e18 * 9n) / 10n, px1e18, (px1e18 * 11n) / 10n, px1e18 * 2n];

    const candidates = [
        ...FEED_NEAR.map(x => ({ kind: "FEED", v: x })),
        ...FEED_WIDE.map(x => ({ kind: "FEED", v: x })),
        ...ONE18_NEAR.map(x => ({ kind: "ONE18", v: x })),
        ...ONE18_WIDE.map(x => ({ kind: "ONE18", v: x })),
        { kind: "SMALL", v: 1n },
        { kind: "HUGE", v: (1n << 255n) }
    ];

    const seen = new Set();
    const uniq = candidates.filter(({ v }) => (v > 0n) && !seen.has(v.toString()) && seen.add(v.toString()));

    console.log(`\nTrying ${uniq.length} bounds (both unit interpretations)...\n`);

    for (const { kind, v } of uniq) {
        try {
            const r = await c.closePosition.staticCall(UI, v, { from: USER });
            console.log(`OK  | ${kind.padEnd(5)} | bound=${v.toString()}`);
        } catch (e) {
            const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
            console.log(`ERR | ${kind.padEnd(5)} | bound=${v.toString()} | ${msg}`);
        }
    }
})();
