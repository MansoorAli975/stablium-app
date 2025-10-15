// script/keeperSendOnce.js
// Usage: ENGINE_ABI_PATH=... VITE_ENGINE_ADDRESS=... VITE_RPC_URL=... PRIVATE_KEY=... node script/keeperSendOnce.js <index>
import { readFileSync } from "fs";
import { ethers } from "ethers";

const [, , idxRaw] = process.argv;
if (!idxRaw) {
    console.error("Usage: node script/keeperSendOnce.js <index>");
    process.exit(1);
}

const ENGINE_ABI_PATH = process.env.ENGINE_ABI_PATH;
const ENGINE_ADDRESS = process.env.VITE_ENGINE_ADDRESS;
const RPC_URL = process.env.VITE_RPC_URL;
const PK = process.env.PRIVATE_KEY;

if (!ENGINE_ABI_PATH || !ENGINE_ADDRESS || !RPC_URL || !PK) {
    console.error("Missing one of ENGINE_ABI_PATH, VITE_ENGINE_ADDRESS, VITE_RPC_URL, PRIVATE_KEY");
    process.exit(1);
}

const abi = JSON.parse(readFileSync(ENGINE_ABI_PATH, "utf8")).abi;

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PK, provider);
    const engine = new ethers.Contract(ENGINE_ADDRESS, abi, wallet);

    const index = BigInt(idxRaw);
    console.log("Engine :", ENGINE_ADDRESS);
    console.log("RPC    :", RPC_URL);
    console.log("Caller :", wallet.address);
    console.log("Index  :", index.toString());
    console.log();

    // 1) Try static first to see if it’s actually triggerable
    try {
        const ok = await engine.checkTpSlAndClose.staticCall(index);
        console.log("✅ staticCall passed. Returned:", ok);
    } catch (e) {
        // show a helpful reason if present
        const reason = e?.reason || e?.shortMessage || e?.message || String(e);
        console.log("❌ staticCall REVERT:", reason);
        process.exit(2);
    }

    // 2) Send the transaction
    try {
        const tx = await engine.checkTpSlAndClose(index);
        console.log("→ sent tx:", tx.hash);
        const rc = await tx.wait();
        console.log("✓ confirmed in block", rc.blockNumber);
    } catch (e) {
        const reason = e?.reason || e?.shortMessage || e?.message || String(e);
        console.log("❌ send REVERT:", reason);
        process.exit(3);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
