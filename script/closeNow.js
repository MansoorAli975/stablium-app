// script/closeNow.js
// ESM, ethers v6 — close a user's position at a UI index using closePosition()
// Usage:
//   ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
//   VITE_ENGINE_ADDRESS=0x... \
//   VITE_RPC_URL="$SEPOLIA_RPC_URL" \
//   PRIVATE_KEY="$PRIVATE_KEY" \
//   node script/closeNow.js GBP 16

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    JsonRpcProvider,
    Wallet,
    Contract,
    MaxUint256,
    Interface
} from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.PRIVATE_KEY;

if (!ENGINE || !RPC || !PK) {
    console.error('Missing ENGINE address, RPC, or PRIVATE_KEY in env.');
    process.exit(1);
}

const BASE = (process.argv[2] || '').toUpperCase();   // e.g. GBP
const UI_IDX = Number(process.argv[3]);                 // e.g. 16
if (!BASE || !Number.isInteger(UI_IDX)) {
    console.error('Usage: node script/closeNow.js <BASE> <UI_INDEX>');
    process.exit(1);
}

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

const toJSON = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

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

    // 1) Ensure this UI index is open for this base
    const openIds = await engine.getOpenPositionIds(me, BASE);
    const hasIdx = openIds.map(x => Number(x)).includes(UI_IDX);
    console.log('Open UI indices for caller+base:', openIds.map(x => Number(x)));
    if (!hasIdx) {
        console.error(`UI index ${UI_IDX} is not open for ${BASE} on ${me}.`);
        process.exit(2);
    }

    // 2) Load tuple to detect side
    const all = await engine.getAllUserPositions(me);
    const pos = all[UI_IDX];
    if (!pos) {
        console.error(`No tuple at UI index ${UI_IDX}.`);
        process.exit(2);
    }
    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const isOpen = Boolean(pos[8]);

    console.log('Tuple @UI index =>', toJSON({
        pair, isLong, isOpen,
        entryFeed: pos[3]?.toString?.() || String(pos[3]),
        tpFeed: pos[12]?.toString?.() || String(pos[12]),
        slFeed: pos[13]?.toString?.() || String(pos[13]),
    }));

    if (!isOpen) {
        console.log('This position is already closed.');
        process.exit(0);
    }
    if (pair.toUpperCase() !== BASE) {
        console.error(`Tuple pair ${pair} != requested base ${BASE}`);
        process.exit(2);
    }

    // 3) Correct bound policy:
    //    - LONG close (you sell):    require(price >= bound)  → use 0n to be permissive
    //    - SHORT close (you buy):    require(price <= bound)  → use MaxUint256 to be permissive
    const priceBound = isLong ? 0n : MaxUint256;
    console.log('Chosen priceBound:', priceBound === 0n ? '0 (LONG safe)' : 'MaxUint256 (SHORT safe)');

    // 4) Dry-run
    try {
        await engine.closePosition.staticCall(UI_IDX, priceBound);
        console.log('✅ staticCall closePosition passes; sending tx…');
    } catch (e) {
        try {
            const dec = iface.parseError(e?.data || e?.error?.data || e);
            console.error('❌ staticCall reverted:', dec?.name || 'Revert', dec?.args ?? []);
        } catch {
            console.error('❌ staticCall reverted:', e?.shortMessage || e?.message || e);
        }
        process.exit(3);
    }

    // 5) Send tx
    try {
        const tx = await engine.closePosition(UI_IDX, priceBound);
        console.log('⏳ tx sent:', tx.hash);
        const rcpt = await tx.wait();
        console.log('✅ mined block', rcpt.blockNumber, 'status', rcpt.status);
    } catch (e) {
        try {
            const dec = iface.parseError(e?.data || e?.error?.data || e);
            console.error('❌ send failed:', dec?.name || 'Revert', dec?.args ?? []);
        } catch {
            console.error('❌ send failed:', e?.shortMessage || e?.message || e);
        }
        process.exit(4);
    }
})();
