// script/scan_indices_bruteforce.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

// Load ABI (we only need checkTpSlAndClose)
const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

// Range controls (can override via env: START, END, PAUSE_MS)
const START = parseInt(process.env.START ?? "0", 10);
const END = parseInt(process.env.END ?? "200", 10); // try small first
const PAUSE_MS = parseInt(process.env.PAUSE_MS ?? "25", 10);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const engine = new ethers.Contract(ENGINE, ABI, provider);

    console.log(`Bruteforcing checkTpSlAndClose on [${START}, ${END}] for ${ENGINE}`);

    const hits = [];
    for (let i = START; i <= END; i++) {
        try {
            const res = await engine.checkTpSlAndClose.staticCall(i);
            hits.push({ i, verdict: `returned ${res}` });
            console.log(`  → ${i}: returned ${res}`);
        } catch (e) {
            const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
            if (/Invalid index/i.test(msg)) {
                // quiet
            } else if (/PriceNotAtTrigger/i.test(msg) || /NotAtTrigger/i.test(msg)) {
                hits.push({ i, verdict: "valid (PriceNotAtTrigger)" });
                console.log(`  → ${i}: valid (PriceNotAtTrigger)`);
            } else {
                // show unknown reverts (useful clues)
                console.log(`  → ${i}: other revert: ${msg}`);
            }
        }
        if (PAUSE_MS) await sleep(PAUSE_MS);
    }

    console.log("\nPossible keeper indices:");
    if (hits.length === 0) console.log("  (none in this window)");
    else hits.forEach(h => console.log(`  • ${h.i} — ${h.verdict}`));
})();
