// script/list_positions_and_probe.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = (process.env.USER_ADDR || "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76").toLowerCase();

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function bn(x) { try { return BigInt(x); } catch { return null; } }
function brief(v) {
    if (typeof v === "bigint") return v.toString();
    if (typeof v === "string") return v.length > 66 ? v.slice(0, 66) + "…" : v;
    if (Array.isArray(v)) return v.map(brief);
    if (v && typeof v === "object") {
        const out = {};
        for (const [k, val] of Object.entries(v)) if (isNaN(+k)) out[k] = brief(val);
        return out;
    }
    return v;
}

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, provider);

    const all = await c.getAllUserPositions(USER);
    console.log("total positions:", all.length);

    for (let i = 0; i < all.length; i++) {
        const pos = all[i];

        // Show named fields if any
        const named = {};
        for (const [k, v] of Object.entries(pos)) if (isNaN(+k)) named[k] = v;
        console.log(`\n[UI index guess = ${i}] named fields:`, brief(named));

        // Gather candidate numeric fields (id-ish)
        const candidates = new Set();
        for (const key of Object.keys(pos)) {
            if (!isNaN(+key)) {
                const v = pos[key];
                if (typeof v === "bigint") {
                    if (v > 0n && v <= (1n << 128n)) candidates.add(v.toString());
                }
            }
        }
        // Common named aliases
        for (const k of ["id", "positionId", "index", "globalId"]) {
            if (pos[k] != null) {
                const v = bn(pos[k]);
                if (v && v > 0n && v <= (1n << 128n)) candidates.add(v.toString());
            }
        }

        const candList = Array.from(candidates).map(s => BigInt(s));
        candList.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

        if (!candList.length) {
            console.log("  (no numeric candidates found in tuple)");
            continue;
        }

        console.log("  numeric candidates to probe:", candList.map(x => x.toString()));

        // Probe each candidate with keeper static call
        for (const id of candList) {
            try {
                const r = await c.checkTpSlAndClose.staticCall(id);
                console.log("  → keeper.static id", id.toString(), "returned:", r);
            } catch (e) {
                const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
                if (/Invalid index/i.test(msg)) {
                    // skip noise
                } else {
                    console.log("  → keeper.static id", id.toString(), "revert:", msg);
                }
            }
        }
    }
})();
