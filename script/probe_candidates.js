// script/probe_candidates.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

// candidates seen in your UI index 16 tuple dump
const CANDIDATES = [
    3n,
    116207000n,                // SL
    121975898n,                // slot14 guess
    126181964n,                // entry
    136207000n,                // TP
    1759751472n,               // timestamp-ish
    10000000000000000n,        // 1e16
    59342835377645572230n,
    74879955172800000000n
];

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    for (const id of CANDIDATES) {
        console.log(`\n== candidate id ${id.toString()} ==`);
        try {
            const r = await c.checkTpSlAndClose.staticCall(id);
            console.log("keeper.static →", r);
        } catch (e) {
            console.log("keeper.static revert →", e?.reason || e?.shortMessage || e?.message);
        }
        try {
            const r2 = await c.closePosition.staticCall(id, 1n);
            console.log("close.static (bound=1) →", r2);
        } catch (e) {
            console.log("close.static (bound=1) revert →", e?.reason || e?.shortMessage || e?.message);
        }
    }
})();
