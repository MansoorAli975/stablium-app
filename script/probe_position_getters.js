// script/probe_position_getters.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const INDEX = parseInt(process.env.INDEX ?? "16", 10);

// Load ABI
const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

function brief(val) {
    if (val == null) return val;
    if (typeof val === "bigint") return val.toString();
    if (typeof val === "string") return val.length > 66 ? val.slice(0, 66) + "…" : val;
    if (Array.isArray(val)) return val.slice(0, 8).map(brief);
    if (typeof val === "object") {
        const out = {};
        let n = 0;
        for (const [k, v] of Object.entries(val)) {
            if (String(+k) === k) continue; // skip numeric aliases
            out[k] = brief(v);
            if (++n >= 16) break; // cap fields
        }
        return out;
    }
    return val;
}

(async () => {
    const provider = new ethers.JsonRpcProvider(RPC);
    const engine = new ethers.Contract(ENGINE, ABI, provider);

    // Candidate getters: 1 uint input, likely view, name contains "position" OR returns a tuple
    const candidates = ABI.filter(f =>
        f.type === "function" &&
        f.inputs?.length === 1 &&
        /^uint/.test(f.inputs[0]?.type || "") &&
        (["view", "pure"].includes(f.stateMutability) || f.stateMutability == null) &&
        (/position/i.test(f.name) || (f.outputs && f.outputs.length >= 1 && f.outputs[0].type.includes("tuple")))
    );

    if (!candidates.length) {
        console.log("No candidate getters found in ABI.");
        return;
    }

    console.log(`Trying ${candidates.length} candidate getters for index ${INDEX}…\n`);
    for (const f of candidates) {
        const sig = `${f.name}(${f.inputs.map(i => i.type).join(",")})`;
        try {
            const res = await engine[f.name](INDEX);
            console.log(`✅ ${sig} → success`);
            console.log("   result:", brief(res), "\n");
        } catch (e) {
            const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
            console.log(`❌ ${sig} → ${msg}`);
        }
    }
})();
