// script/scan_logs_for_keeper_id.js (chunked, addr-anywhere)
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = (process.env.USER_ADDR || "0x156F3D3CE28ba1c0cfb077c2405c70125093ad76").toLowerCase();

// ABI (only need keeper function)
const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function hexToBig(x) { try { return BigInt(x); } catch { return null; } }
function chunkDataToCandidates(dataHex) {
    const out = []; if (!dataHex || dataHex === "0x") return out;
    const s = dataHex.startsWith("0x") ? dataHex.slice(2) : dataHex;
    for (let i = 0; i + 64 <= s.length; i += 64) {
        const n = hexToBig("0x" + s.slice(i, i + 64));
        if (n !== null) out.push(n);
    }
    return out;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const engine = new ethers.Contract(ENGINE, ABI, provider);

    const latest = await provider.getBlockNumber();
    const RANGE = parseInt(process.env.RANGE || "10000", 10); // wider window
    const CHUNK = parseInt(process.env.CHUNK || "8", 10);     // <=10 for free tier
    const PAUSE_MS = parseInt(process.env.PAUSE_MS || "150", 10);

    const toBlk = latest;
    const fromBlk = Math.max(0, toBlk - RANGE);

    console.log(`Scanning ${ENGINE} from ${fromBlk} to ${toBlk} (chunk=${CHUNK}) for USER ${USER}`);

    const mePadded = ethers.zeroPadValue(USER, 32).toLowerCase();
    const meWord = mePadded.slice(2); // without 0x
    const candidates = new Set();

    for (let start = fromBlk; start <= toBlk; start += CHUNK) {
        const end = Math.min(toBlk, start + CHUNK - 1);
        try {
            const logs = await provider.getLogs({ address: ENGINE, fromBlock: start, toBlock: end });
            for (const log of logs) {
                const topicsLower = log.topics.map(t => t.toLowerCase());
                const dataLower = (log.data || "").toLowerCase();

                // consider it "mine" if my padded address appears in ANY topic OR anywhere in data
                const isMine = topicsLower.includes(mePadded) || dataLower.includes(meWord);
                if (!isMine) continue;

                // collect numeric-looking candidates from topics[2..] and data words
                for (let i = 1; i < topicsLower.length; i++) {
                    const n = hexToBig(topicsLower[i]); if (n !== null) candidates.add(n.toString());
                }
                for (const n of chunkDataToCandidates(dataLower)) {
                    if (n >= 0n && n <= (1n << 128n)) candidates.add(n.toString());
                }
            }
        } catch (e) {
            console.log(`getLogs failed @ [${start},${end}]: ${(e?.message || e)}`);
        }
        await sleep(PAUSE_MS);
    }

    const uniq = Array.from(candidates).map(s => BigInt(s)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    console.log(`Collected ${uniq.length} candidate ids. Probing with static calls...`);

    const valid = [];
    for (const id of uniq) {
        try {
            const res = await engine.checkTpSlAndClose.staticCall(id);
            valid.push({ id: id.toString(), verdict: `returned ${res}` });
        } catch (e) {
            const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
            if (/Invalid index/i.test(msg)) {
                // ignore invalid indices
            } else if (/PriceNotAtTrigger/i.test(msg) || /NotAtTrigger/i.test(msg)) {
                valid.push({ id: id.toString(), verdict: "valid (PriceNotAtTrigger)" });
            } else {
                valid.push({ id: id.toString(), verdict: `other revert: ${msg}` });
            }
        }
    }

    console.log("\nLikely keeper indices for this USER:");
    for (const v of valid) console.log("  →", v.id, "-", v.verdict);

    if (!valid.length) {
        console.log("\nNo valid indices found. Increase RANGE (e.g., 50000) and re-run:");
        console.log("  RANGE=50000 CHUNK=8 node script/scan_logs_for_keeper_id.js");
    }
})();
