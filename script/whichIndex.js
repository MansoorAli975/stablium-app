// script/whichIndex.js
// ESM, ethers v6 — print both UI index and the tuple's global-ish id
// Usage:
//   ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
//   VITE_ENGINE_ADDRESS=0x... \
//   VITE_RPC_URL="$SEPOLIA_RPC_URL" \
//   PRIVATE_KEY="$PRIVATE_KEY" \
//   node script/whichIndex.js GBP 16

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

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
    console.error('Usage: node script/whichIndex.js <BASE> <UI_INDEX>');
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

    const tuple = {
        user: String(pos[0]),
        pair: String(pos[1]),
        isLong: Boolean(pos[2]),
        entryFeed: pos[3]?.toString?.() || String(pos[3]),
        marginWei: pos[4]?.toString?.() || String(pos[4]),
        leverage: pos[5]?.toString?.() || String(pos[5]),
        size1e18: pos[6]?.toString?.() || String(pos[6]),
        tsOpen: pos[7]?.toString?.() || String(pos[7]),
        isOpen: Boolean(pos[8]),
        // [9],[10],[11] often tp/sl/liq feed or 0 in your build – we keep the tail:
        slot12: pos[12]?.toString?.() || String(pos[12]), // TP in feed units
        slot13: pos[13]?.toString?.() || String(pos[13]), // SL in feed units
        slot14: pos[14]?.toString?.() || String(pos[14]), // likely global id
        slot15: pos[15]?.toString?.() || String(pos[15]),
    };

    console.log('\nTuple @UI index =>', toJSON(tuple));
    console.log('\nCandidates:');
    console.log(' - UI index      :', UI_IDX);
    console.log(' - Global id?    :', tuple.slot14);
})();
