// script/show_collateral_feeds.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

const FEED_ABI = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

function fmt(n, dp) {
    const s = BigInt(n).toString().padStart(dp + 1, "0");
    return s.slice(0, -dp) + "." + s.slice(-dp);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    const tokens = await c.getCollateralTokens(); // addresses
    console.log("collateral tokens:", tokens);

    const now = Math.floor(Date.now() / 1000);

    for (const t of tokens) {
        try {
            const feed = await c.getPriceFeed(t);
            console.log(`\nToken ${t} -> priceFeed ${feed}`);
            if (feed === ethers.ZeroAddress) { console.log("  (no feed)"); continue; }

            const f = new ethers.Contract(feed, FEED_ABI, p);
            const dp = Number(await f.decimals());
            const [, ans, , updatedAt] = await f.latestRoundData();
            const age = now - Number(updatedAt);
            console.log(`  price=${fmt(BigInt(ans), dp)}  age=${age}s  dp=${dp}`);
        } catch (e) {
            console.log(`  error reading feed for ${t}:`, e?.reason || e?.shortMessage || e?.message);
        }
    }
})();
