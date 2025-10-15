// script/closeEither.js
// ESM, ethers v6 — try closePosition by UI index, then by tuple's global id (slot14)
// Usage:
//   ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
//   VITE_ENGINE_ADDRESS=0x... \
//   VITE_RPC_URL="$SEPOLIA_RPC_URL" \
//   PRIVATE_KEY="$PRIVATE_KEY" \
//   node script/closeEither.js GBP 16

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

const BASE = (process.argv[2] || '').toUpperCase();
const UI_IDX = Number(process.argv[3]);

if (!ENGINE || !RPC || !PK) {
    console.error('Missing ENGINE, RPC, or PRIVATE_KEY in env.');
    process.exit(1);
}
if (!BASE || !Number.isInteger(UI_IDX)) {
    console.error('Usage: node script/closeEither.js <BASE> <UI_INDEX>');
    process.exit(1);
}

const toJSON = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

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
    const me = await wallet.getAddress();
    const engine = new Contract(ENGINE, abi, wallet);

    console.log('Engine :', ENGINE);
    console.log('RPC    :', RPC);
    console.log('Caller :', me);
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_IDX);
    console.log('ABI    :', abs);

    const openUI = (await engine.getOpenPositionIds(me, BASE)).map(x => Number(x));
    console.log('Open UI indices for caller+base:', openUI);

    const all = await engine.getAllUserPositions(me);
    const pos = all[UI_IDX];
    if (!pos) {
        console.error(`No tuple at UI index ${UI_IDX}.`);
        process.exit(2);
    }

    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const isOpen = Boolean(pos[8]);
    const tpFeed = BigInt(pos[12] || 0);
    const slFeed = BigInt(pos[13] || 0);
    const global = BigInt(pos[14] || 0);

    console.log('Tuple @UI index =>', toJSON({
        pair, isLong, isOpen,
        entryFeed: pos[3]?.toString?.() || String(pos[3]),
        tpFeed: tpFeed.toString(),
        slFeed: slFeed.toString(),
        globalCandidate: global.toString(),
    }));

    if (!isOpen) {
        console.log('Already closed. Exiting.');
        return;
    }
    if (pair.toUpperCase() !== BASE) {
        console.error(`Tuple pair ${pair} != requested base ${BASE}`);
        process.exit(2);
    }

    const priceBound = isLong ? 0n : MaxUint256;
    console.log('Chosen priceBound:', priceBound === 0n ? '0 (LONG safe)' : 'MaxUint256 (SHORT safe)');

    async function tryClose(idxLabel, idxValue) {
        if (idxValue == null) return false;
        console.log(`\n--- Attempt close by ${idxLabel}=${idxValue.toString()} ---`);

        // static
        try {
            await engine.closePosition.staticCall(idxValue, priceBound);
            console.log('✅ staticCall OK; sending tx…');
        } catch (e) {
            try {
                const dec = iface.parseError(e?.data || e?.error?.data || e);
                console.error('❌ staticCall reverted:', dec?.name || 'Revert', dec?.args ?? []);
            } catch {
                console.error('❌ staticCall reverted:', e?.shortMessage || e?.message || e);
            }
            return false;
        }

        // send
        try {
            const tx = await engine.closePosition(idxValue, priceBound);
            console.log('⏳ tx sent:', tx.hash);
            const rcpt = await tx.wait();
            console.log('✅ mined block', rcpt.blockNumber, 'status', rcpt.status);
            return true;
        } catch (e) {
            try {
                const dec = iface.parseError(e?.data || e?.error?.data || e);
                console.error('❌ send failed:', dec?.name || 'Revert', dec?.args ?? []);
            } catch {
                console.error('❌ send failed:', e?.shortMessage || e?.message || e);
            }
            return false;
        }
    }

    // Try UI index first, then global id
    const okByUI = await tryClose('UI', BigInt(UI_IDX));
    if (okByUI) return;

    if (global && global !== BigInt(UI_IDX)) {
        const okByGlobal = await tryClose('GLOBAL', global);
        if (okByGlobal) return;
    }

    console.log('\n❌ Both attempts failed. This strongly suggests the engine expects the *other* index type or the tuple->id slot mapping differs in your build.');
})();
