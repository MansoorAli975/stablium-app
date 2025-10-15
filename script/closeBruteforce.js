// script/closeBruteforce.js
// ESM, ethers v6 — brute-force a safe priceBound for closePosition and submit only if staticCall passes.
//
// Usage:
//   ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
//   VITE_ENGINE_ADDRESS=0x... \
//   VITE_RPC_URL="$SEPOLIA_RPC_URL" \
//   PRIVATE_KEY="$PRIVATE_KEY" \
//   node script/closeBruteforce.js GBP 16
//
// Notes:
// - Tries UI index first (16), then tuple.slot14 (often NOT an id, but we probe anyway).
// - For LONG: tests [now, now*0.999, now*0.995, now*0.99, now*0.97, now*0.95, now*0.90, 0].
// - For SHORT: tests [now, now*1.001, now*1.005, now*1.01, now*1.03, now*1.05, now*1.10, MaxUint256].
// - Only sends the tx if a staticCall succeeds.

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    JsonRpcProvider,
    Wallet,
    Contract,
    Interface,
    MaxUint256,
    parseUnits
} from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.PRIVATE_KEY;

const BASE = (process.argv[2] || '').toUpperCase();
const UI_IDX = Number(process.argv[3]);

if (!ENGINE || !RPC || !PK) {
    console.error('Missing ENGINE, RPC, or PRIVATE_KEY in env.');
    process.exit(1);
}
if (!BASE || !Number.isInteger(UI_IDX)) {
    console.error('Usage: node script/closeBruteforce.js <BASE> <UI_INDEX>');
    process.exit(1);
}

const toJSON = (v) =>
    JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

function mulPct1e18(x1e18, bpsDelta) {
    // bpsDelta positive => up; negative => down
    // x * (1 + bps/10000)
    const ONE = 10n ** 18n;
    const bps = BigInt(bpsDelta);
    return (x1e18 * (ONE + (bps * ONE) / 10000n)) / ONE;
}

(async () => {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const me = await wallet.getAddress();
    const engine = new Contract(ENGINE, abi, wallet);

    console.log('Engine :', ENGINE);
    console.log('RPC    :', RPC);
    console.log('Caller :', me);
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_IDX);
    console.log('ABI    :', abs);

    // Confirm UI index exists for this base
    const uiOpen = (await engine.getOpenPositionIds(me, BASE)).map(x => Number(x));
    console.log('Open UI indices for caller+base:', uiOpen);

    // Pull tuple and live price
    const all = await engine.getAllUserPositions(me);
    const pos = all[UI_IDX];
    if (!pos) {
        console.error(`No tuple at UI index ${UI_IDX}.`);
        process.exit(2);
    }

    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const isOpen = Boolean(pos[8]);
    const slot14 = BigInt(pos[14] || 0); // NOT guaranteed to be global id; we only probe it.
    const entryFd = BigInt(pos[3] || 0);  // feed units
    console.log('\nTuple @UI index =>', toJSON({
        pair, isLong, isOpen,
        entryFeed: entryFd.toString(),
        slot14: slot14.toString(),
    }));

    if (!isOpen) {
        console.log('Already closed.');
        return;
    }
    if (pair.toUpperCase() !== BASE) {
        console.error(`Tuple pair ${pair} != requested ${BASE}`);
        process.exit(2);
    }

    const now1e18 = await engine.getDerivedPrice(BASE, 'USD');
    console.log('\nLive', BASE, '/USD (1e18):', now1e18.toString());

    // Build candidate bounds (1e18). We will *not* assume the 0/Max trick; we’ll probe safely.
    const candidates1e18 = [];
    const pushOnce = (x) => { if (x != null) candidates1e18.push(x); };

    if (isLong) {
        // We are SELLING to close. Guard is usually a *floor*. Try from strict to lenient:
        pushOnce(now1e18);                              // exact now
        pushOnce(mulPct1e18(now1e18, -1));              // -1 bps
        pushOnce(mulPct1e18(now1e18, -5));              // -5 bps
        pushOnce(mulPct1e18(now1e18, -10));             // -10 bps
        pushOnce(mulPct1e18(now1e18, -30));             // -30 bps
        pushOnce(mulPct1e18(now1e18, -50));             // -50 bps
        pushOnce(mulPct1e18(now1e18, -100));            // -100 bps
        pushOnce(0n);                                   // last resort (some builds treat this as "no guard")
    } else {
        // SHORT (we are BUYING to close). Guard is usually a *ceiling*.
        pushOnce(now1e18);
        pushOnce(mulPct1e18(now1e18, +1));
        pushOnce(mulPct1e18(now1e18, +5));
        pushOnce(mulPct1e18(now1e18, +10));
        pushOnce(mulPct1e18(now1e18, +30));
        pushOnce(mulPct1e18(now1e18, +50));
        pushOnce(mulPct1e18(now1e18, +100));
        pushOnce(MaxUint256);                           // last resort ("no guard")
    }

    // Deduplicate
    const uniq = [...new Map(candidates1e18.map(v => [v.toString(), v])).values()];
    console.log('\nCandidate priceBounds (1e18):', uniq.map(x => x.toString()));

    async function tryIndex(label, idx) {
        if (idx == null) return false;
        console.log(`\n=== Probing closePosition at ${label}=${idx.toString()} ===`);
        for (const bound of uniq) {
            process.stdout.write(`  • staticCall bound=${bound.toString()} … `);
            try {
                await engine.closePosition.staticCall(idx, bound);
                console.log('OK → sending tx');
                const tx = await engine.closePosition(idx, bound);
                console.log('    tx:', tx.hash);
                const rcpt = await tx.wait();
                console.log('    ✅ mined block', rcpt.blockNumber, 'status', rcpt.status);
                return true;
            } catch (e) {
                // decode if possible
                try {
                    const dec = iface.parseError(e?.data || e?.error?.data || e);
                    console.log(`revert ${dec?.name || 'Revert'}`);
                } catch {
                    const msg = e?.shortMessage || e?.message || String(e);
                    console.log(`revert (${msg})`);
                }
            }
        }
        return false;
    }

    // 1) Try UI index as engine index
    const okUI = await tryIndex('UI', BigInt(UI_IDX));
    if (okUI) return;

    // 2) Try slot14 as a fallback "global" id
    if (slot14) {
        const okGlobal = await tryIndex('slot14', slot14);
        if (okGlobal) return;
    }

    console.log('\n❌ Could not find a passing (index, bound) pair via staticCall. This indicates the engine is using an index namespace we can’t infer from views, or the long/short guard math inside the engine is inconsistent for this tuple. At this point, the contract code or a dedicated “resolve index” view would be needed.');
})();
