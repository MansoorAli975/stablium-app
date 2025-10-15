// script/checkTpSlAllOpen.js
// Node ES module (package.json "type": "module"), ethers v6
import { readFileSync } from "fs";
import { setTimeout as sleep } from "timers/promises";
import { ethers } from "ethers";

// ---- ENV ----
// ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json
// VITE_ENGINE_ADDRESS=0x1da038c579096b9C11adD7af8429979D703Ae543
// VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/<key>
// KEEPER_PRIVATE_KEY=<pk funding Account7 or another funded keeper>
// OPEN_INDEXES=12,13,21  (comma-separated position indices you want to watch)
// LOOP_MS=15000          (how often to iterate)
function env(name, req = true, def = undefined) {
    const v = process.env[name] ?? def;
    if (req && !v) throw new Error(`Missing env ${name}`);
    return v;
}

const ABI_PATH = env("ENGINE_ABI_PATH");
const ENGINE = env("VITE_ENGINE_ADDRESS");
const RPC = env("VITE_RPC_URL");
const PK = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY;
const LOOP_MS = Number(env("LOOP_MS", false, "15000"));
let INDEXES = env("OPEN_INDEXES").split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n));

const abiJson = JSON.parse(readFileSync(ABI_PATH, "utf8"));
const engineAbi = abiJson.abi || abiJson;

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PK, provider);
const engine = new ethers.Contract(ENGINE, engineAbi, wallet);

async function wouldClose(index) {
    try {
        // Try a static call first; if it doesn’t revert, we assume it would close.
        await engine.checkTpSlAndClose.staticCall(index);
        return true;
    } catch (_) {
        return false;
    }
}

async function tryClose(index) {
    try {
        if (await wouldClose(index)) {
            const tx = await engine.checkTpSlAndClose(index);
            console.log(`[keeper] index=${index} sent ${tx.hash}`);
            const rc = await tx.wait();
            console.log(`[keeper] index=${index} confirmed in block ${rc.blockNumber}`);
            return true;
        }
    } catch (e) {
        // Common benign cases: already closed, stale/no trigger yet, transient nonce issues
        console.log(`[keeper] index=${index} no-close (${e.shortMessage || e.message || e})`);
    }
    return false;
}

async function main() {
    console.log(`[keeper] Watching indices: ${INDEXES.join(", ")} on ${ENGINE}`);
    while (true) {
        // Iterate over a copy to allow pruning while looping
        for (const idx of [...INDEXES]) {
            const closed = await tryClose(idx);
            if (closed) {
                // Optional: remove from list to stop checking once closed
                INDEXES = INDEXES.filter(i => i !== idx);
                console.log(`[keeper] removed index ${idx} from watch list`);
            }
        }
        if (INDEXES.length === 0) {
            console.log(`[keeper] no indices left to watch; sleeping ${LOOP_MS}ms`);
        }
        await sleep(LOOP_MS);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
