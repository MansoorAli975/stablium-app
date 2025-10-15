// script/pushSymbolOnce.js  (ESM, ethers v6)
// Usage: node script/pushSymbolOnce.js <BASE> <priceWith8dp>
// Example: node script/pushSymbolOnce.js EUR 1.08560000

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

// ---- env ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE_ADDR = process.env.VITE_ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!ENGINE_ADDR || !RPC || !PK) {
    console.error('Missing ENGINE address, RPC, or ORACLE/PRIVATE key.');
    process.exit(1);
}

// ---- args ----
const BASE = (process.argv[2] || '').toUpperCase();
const HUMAN = process.argv[3];
if (!BASE || !HUMAN) {
    console.log('Usage: node script/pushSymbolOnce.js <BASE> <priceWith8dp>');
    process.exit(1);
}

// ---- ABIs ----
const FEED_RO_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', // roundId, answer, startedAt, updatedAt, answeredInRound
];

// include a few common writer variants; we’ll try them in order
const FEED_WRITE_ABI = [
    'function updateAnswer(int256 answer) external',
    'function setLatestAnswer(int256 answer) external',
    'function pushPrice(int256 answer) external',
    'function transmit(int192 answer, uint64 timestamp) external returns (bool)',
];

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

function toFeedUnits8(humanStr) {
    // feed uses 8dp (your setup does); if some feed is different, we fetch decimals anyway
    const [whole = '0', frac = ''] = String(humanStr).split('.');
    const padded = (frac + '00000000').slice(0, 8);
    return BigInt(whole + padded); // int256 units with 8 decimals
}

(async () => {
    const { abi, abs } = await loadAbi();
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE_ADDR, abi, wallet);

    // resolve feed for BASE
    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    if (!feedAddr || feedAddr === '0x0000000000000000000000000000000000000000') {
        console.error(`No feed configured for ${BASE}`);
        process.exit(1);
    }

    const feedRO = new Contract(feedAddr, FEED_RO_ABI, provider);
    const [_, ans, , updatedAt] = await feedRO.latestRoundData();
    const dec = await feedRO.decimals();
    const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt || 0));

    // show current
    const currHuman = Number(ans) / 10 ** Number(dec || 8);
    console.log(`Current ${BASE}/USD: ${currHuman}  | age(s)= ${ageSec}`);

    // compute target units using actual feed decimals
    const dp = Number(dec);
    const toUnits = (humanStr) => {
        const [w = '0', f0 = ''] = String(humanStr).split('.');
        const f = (f0 + '0'.repeat(dp)).slice(0, dp);
        return BigInt(w + f);
    };
    const targetUnits = toUnits(HUMAN);

    // writer contract with multiple candidates
    const feedWR = new Contract(feedAddr, [...FEED_RO_ABI, ...FEED_WRITE_ABI], wallet);

    // attempt writers in this order
    const attempts = [
        { name: 'updateAnswer', args: [targetUnits] },
        { name: 'setLatestAnswer', args: [targetUnits] },
        { name: 'pushPrice', args: [targetUnits] },
        { name: 'transmit', args: [targetUnits, BigInt(Math.floor(Date.now() / 1000))] },
    ];

    let sent = null, used = null;
    for (const a of attempts) {
        try {
            if (typeof feedWR[a.name] !== 'function') continue;
            // static test (best-effort)
            try { await feedWR[a.name].staticCall(...a.args); } catch { /* many writer fns will revert on static; ignore */ }
            const tx = await feedWR[a.name](...a.args);
            used = a.name;
            sent = await tx.wait();
            break;
        } catch (e) {
            // try next
        }
    }

    if (!sent) {
        console.error(`All writer funcs failed for ${BASE} at ${feedAddr}. Check which function your feed exposes.`);
        process.exit(1);
    }

    console.log(`→ push ${BASE} to ${HUMAN} via ${used} tx= ${sent.hash}`);
    console.log(`✓ confirmed in block ${sent.blockNumber}`);
})();
