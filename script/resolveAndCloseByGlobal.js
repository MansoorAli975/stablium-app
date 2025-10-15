// script/resolveAndCloseByGlobal.js
// ESM, ethers v6 — robustly discover the engine's *global* index from the user tuple
import 'dotenv/config';
import { readFileSync } from 'fs';
import {
    JsonRpcProvider,
    Wallet,
    Contract,
    Interface,
    MaxUint256,
} from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

// Funded key (keeper/oracle or your trader key)
const PK = process.env.KEEPER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;

const USER = process.argv[2];                // e.g. 0x156F...Ad76
const PAIR = (process.argv[3] || 'GBP');     // e.g. GBP
const UI_IDX = Number(process.argv[4]);        // e.g. 16

if (!RPC || !ENGINE || !PK || !USER || !Number.isFinite(UI_IDX)) {
    console.error('Usage: node script/resolveAndCloseByGlobal.js <USER> <PAIR> <UI_INDEX>');
    process.exit(1);
}

const toJSON = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE, ABI, wallet);
    const iface = new Interface(ABI);

    console.log('[resolve] engine :', ENGINE);
    console.log('[resolve] caller :', await wallet.getAddress());
    console.log('[resolve] user   :', USER);
    console.log('[resolve] pair   :', PAIR);
    console.log('[resolve] uiIdx  :', UI_IDX);

    // Pull full positions; the UI index refers to this array index
    const all = await engine.getAllUserPositions(USER);
    if (UI_IDX < 0 || UI_IDX >= all.length) {
        console.error(`[resolve] UI index ${UI_IDX} is out of range (0..${all.length - 1})`);
        process.exit(2);
    }

    const pos = all[UI_IDX];
    console.log(`[resolve] Position[${UI_IDX}] tuple:`);
    console.log(toJSON(pos));

    // Build candidate set from the last 8 elements (typical index + TP/SL live there)
    const LEN = pos.length ?? 0;
    const START = Math.max(0, LEN - 8);
    const tail = [];
    for (let i = START; i < LEN; i++) {
        const v = pos[i];
        if (typeof v === 'bigint') {
            tail.push({ slot: i, val: v });
        }
    }

    if (!tail.length) {
        console.error('[resolve] No bigint fields found near the tail; cannot infer index.');
        process.exit(3);
    }

    console.log('[resolve] tail bigint candidates:', tail.map(t => `slot${t.slot}=${t.val.toString()}`).join(', '));

    // Helper: decode error name (if custom)
    function decodeErr(e) {
        try {
            const dec = iface.parseError(e?.data || e?.error?.data || e);
            return dec?.name || 'CustomError';
        } catch {
            if (e?.data?.data) {
                try { return iface.parseError(e.data.data)?.name || 'CustomError'; } catch { /* ignore */ }
            }
        }
        const msg = e?.shortMessage || e?.reason || e?.message || String(e);
        // rough mapping for vm panics
        if (/overflow|panic/i.test(msg)) return 'Panic';
        return msg;
    }

    // Strategy:
    //  - Try keeper.staticCall for each candidate.
    //  - If error == Invalid index -> not it, continue.
    //  - If error == PriceNotAtTrigger -> VALID global index (just not at TP/SL yet).
    //  - If it *passes* -> VALID global index and currently triggerable.
    //  - Ignore obvious feed-like values by skipping those that exactly equal the tuple TP/SL (if present).
    const tp = (typeof pos[12] === 'bigint') ? pos[12] : null;
    const sl = (typeof pos[13] === 'bigint') ? pos[13] : null;

    // Prefer larger-ish ids, but skip TP/SL equalities
    const candidates = tail
        .filter(t => (tp === null || t.val !== tp) && (sl === null || t.val !== sl))
        // heuristic: global ids often around 1e8..1e10 range for your setup
        .sort((a, b) => (a.val < b.val ? 1 : -1));

    let globalIdx = null;
    for (const c of candidates) {
        try {
            await engine.checkTpSlAndClose.staticCall(c.val);
            console.log(`✅ keeper.staticCall OK at slot ${c.slot}: looks TRIGGERABLE now; using ${c.val.toString()}`);
            globalIdx = c.val;
            break;
        } catch (e) {
            const name = decodeErr(e);
            console.log(`ℹ️ keeper.staticCall REVERT slot ${c.slot}=${c.val.toString()}: ${name}`);
            if (/Invalid index/i.test(name)) {
                // not an index
                continue;
            }
            if (/PriceNotAtTrigger/i.test(name)) {
                console.log(`✅ slot ${c.slot} looks like a VALID global index (just not at trigger). using ${c.val.toString()}`);
                globalIdx = c.val;
                break;
            }
            // Other errors (e.g., Panic) — skip
        }
    }

    if (!globalIdx) {
        // Last resort: try the classic "second from last" slot (you saw ~121,975,898 there)
        if (typeof pos[LEN - 2] === 'bigint') {
            globalIdx = pos[LEN - 2];
            console.log('[resolve] fallback to 2nd-from-last element as global index:', globalIdx.toString());
        } else {
            console.error('[resolve] could not infer a valid global index. Inspect the tuple above.');
            process.exit(4);
        }
    }

    // Show live price and test manual close bounds for sanity (static only)
    const live1e18 = await engine.getDerivedPrice(PAIR, 'USD');
    console.log('[resolve] live', PAIR, '/USD (1e18):', live1e18.toString());

    for (const b of [
        { label: 'zero', val: 0n },
        { label: 'max', val: MaxUint256 },
        { label: 'live', val: live1e18 },
    ]) {
        try {
            await engine.closePosition.staticCall(globalIdx, b.val);
            console.log(`✅ close.staticCall OK global=${globalIdx} bound=${b.label}`);
        } catch (e) {
            const name = decodeErr(e);
            console.log(`ℹ️ close.staticCall REVERT global=${globalIdx} bound=${b.label}: ${name}`);
        }
    }

    console.log('[resolve] FINAL global index candidate:', globalIdx.toString());
})();
