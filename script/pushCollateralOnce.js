// script/pushCollateralOnce.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const PK = process.env.PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY; // use your oracle/trader key

if (!PK) {
    console.error("❌ Set PRIVATE_KEY (or ORACLE_PRIVATE_KEY) in your .env");
    process.exit(1);
}

// Usage: node script/pushCollateralOnce.js <priceDecimalString> [feedAddressOverride]
const [, , priceStr, feedOverride] = process.argv;
if (!priceStr) {
    console.error("Usage: node script/pushCollateralOnce.js <priceDecimalString> [feedAddressOverride]");
    process.exit(1);
}

// Parse Forge artifact or raw ABI
const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function toUnits(decStr, dp) {
    const [a, b = ""] = decStr.split(".");
    const frac = (b + "0".repeat(dp)).slice(0, dp);
    return BigInt(a) * (10n ** BigInt(dp)) + BigInt(frac);
}

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const wallet = new ethers.Wallet(PK, provider);
    const engine = new ethers.Contract(ENGINE, ABI, wallet);

    // Resolve the collateral feed address
    let feedAddr = feedOverride;
    if (!feedAddr) {
        const tokens = await engine.getCollateralTokens();
        if (!tokens.length) {
            console.error("❌ No collateral tokens configured on engine");
            process.exit(1);
        }
        const token = tokens[0];
        feedAddr = await engine.getPriceFeed(token);
        console.log("collateral token:", token, "→ feed:", feedAddr);
    }

    // Collateral feed interface (same updateAnswer used for your synthetic feeds)
    const feed = new ethers.Contract(
        feedAddr,
        [
            "function decimals() view returns (uint8)",
            "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
            "function updateAnswer(int256 _answer)"
        ],
        wallet
    );

    const dp = Number(await feed.decimals());
    const units = toUnits(priceStr, dp);

    const [, oldAns, , oldUpdatedAt] = await feed.latestRoundData();
    console.log("before: price =", ethers.formatUnits(oldAns, dp), "age(s) ~", Math.floor(Date.now() / 1000) - Number(oldUpdatedAt));

    const tx = await feed.updateAnswer(units);
    console.log("→ updateAnswer tx =", tx.hash);
    const rcpt = await tx.wait();
    console.log("✓ confirmed in block", rcpt.blockNumber);

    const [, newAns, , newUpdatedAt] = await feed.latestRoundData();
    console.log("after : price =", ethers.formatUnits(newAns, dp), "age(s) ~", Math.floor(Date.now() / 1000) - Number(newUpdatedAt));
})();
