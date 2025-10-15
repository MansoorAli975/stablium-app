// script/trigger_params.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

// hardcode GBP TP from your handover (feed units, 8 dp): 136207000 -> 1.36207000
const TP_FEED = 136_207_000n;

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function fmt(n, dpNum) {
    const s = BigInt(n).toString().padStart(dpNum + 1, "0");
    return s.slice(0, -dpNum) + "." + s.slice(-dpNum);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    const [buf, tick] = await Promise.all([
        c.priceTriggerBuffer(),     // BigInt (feed units)
        c.MIN_PRICE_MOVEMENT(),     // BigInt (feed units)
    ]);

    // current GBP price & age
    const gbpFeedAddr = await c.getSyntheticPriceFeed("GBP");
    const f = new ethers.Contract(
        gbpFeedAddr,
        [
            "function decimals() view returns (uint8)",
            "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
        ],
        p
    );
    const dpNum = Number(await f.decimals());
    const [, ans, , updatedAt] = await f.latestRoundData();
    const px = BigInt(ans);
    const age = Math.floor(Date.now() / 1000) - Number(updatedAt);

    // for a LONG, require >= TP + buffer; add +2*tick for safety
    const target = TP_FEED + BigInt(buf) + 2n * BigInt(tick);

    console.log("MIN_PRICE_MOVEMENT (tick):", tick.toString(), "(feed units)");
    console.log("priceTriggerBuffer      :", buf.toString(), "(feed units)");
    console.log("TP (feed)               :", TP_FEED.toString(), "=>", fmt(TP_FEED, dpNum));
    console.log("current GBP             :", px.toString(), "=>", fmt(px, dpNum), `age=${age}s`);
    console.log("safe LONG target        :", target.toString(), "=>", fmt(target, dpNum));
})();
