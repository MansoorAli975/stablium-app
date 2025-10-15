// script/forceCloseUi.js
// ESM, ethers v6 — close by *UI index* using the *owner's key* with correct guard:
// LONG  -> MaxUint256 (ceiling, i.e. no guard)
// SHORT -> 0          (floor, i.e. no guard)
//
// Usage:
// ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
// VITE_ENGINE_ADDRESS=0x... \
// VITE_RPC_URL="$SEPOLIA_RPC_URL" \
// PRIVATE_KEY="$PRIVATE_KEY" \
// node script/forceCloseUi.js GBP 16

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
    console.error('Usage: node script/forceCloseUi.js <BASE> <UI_INDEX>');
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

(async () => {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE, abi, wallet);
    const me = await wallet.getAddress();

    console.log('Engine :', ENGINE);
    console.log('RPC    :', RPC);
    console.log('Caller :', me);
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_IDX);
    console.log('ABI    :', abs);

    // Must be the OWNER of the position; index is per-caller
    const uiOpen = (await engine.getOpenPositionIds(me, BASE)).map(x => Number(x));
    console.log('Open UI indices for caller+base:', uiOpen);
    if (!uiOpen.includes(UI_IDX)) {
        console.error(`UI index ${UI_IDX} is not open for ${me} on ${BASE}.`);
        process.exit(2);
    }

    const all = await engine.getAllUserPositions(me);
    const pos = all[UI_IDX];
    if (!pos) {
        console.error(`No tuple at UI index ${UI_IDX}.`);
        process.exit(2);
    }

    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const isOpen = Boolean(pos[8]);
    console.log('\nTuple @UI index =>', toJSON({
        pair, isLong, isOpen,
        entryFeed: (pos[3] || 0).toString(),
        tpFeed: (pos[12] || 0).toString?.() ?? String(pos[12]),
        slFeed: (pos[13] || 0).toString?.() ?? String(pos[13]),
    }));
    if (!isOpen) {
        console.log('Already closed.');
        return;
    }
    if (pair.toUpperCase() !== BASE) {
        console.error(`Tuple pair ${pair} != requested ${BASE}`);
        process.exit(2);
    }

    // Correct guards for THIS engine:
    const guard = isLong ? MaxUint256 : 0n;
    console.log(`Chosen priceBound: ${guard.toString()} (${isLong ? 'LONG→MaxUint256' : 'SHORT→0'})`);

    try {
        await engine.closePosition.staticCall(BigInt(UI_IDX), guard);
    } catch (e) {
        let reason = '';
        try { reason = iface.parseError(e?.data || e?.error?.data || e)?.name || ''; } catch { }
        console.error('❌ staticCall reverted:', reason || (e?.shortMessage || e?.message || String(e)));
        process.exit(1);
    }

    const tx = await engine.closePosition(BigInt(UI_IDX), guard);
    console.log('⏳ sent:', tx.hash);
    const rcpt = await tx.wait();
    console.log('✅ mined block', rcpt.blockNumber, 'status', rcpt.status);
})();
