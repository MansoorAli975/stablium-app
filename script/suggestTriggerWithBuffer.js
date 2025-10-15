// ESM, ethers v6 — print TP/SL exact and +/- buffer targets as paste-ready decimals
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

// Optional: use PRIVATE_KEY to infer user if not passed
const PK = process.env.PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;

const BASE = (process.argv[2] || 'GBP').toUpperCase();
const UI_IDX = process.argv[3] ? Number(process.argv[3]) : null;
const USER = process.argv[4]; // optional explicit user; otherwise wallet addr if PK provided

if (!ENGINE || !RPC) {
    console.error('Missing ENGINE or RPC. Set VITE_ENGINE_ADDRESS and VITE_RPC_URL.');
    process.exit(1);
}
if (UI_IDX == null) {
    console.error('Usage: node script/suggestTriggerWithBuffer.js <BASE> <UI_INDEX> [USER]');
    process.exit(1);
}

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)'
];

function feedToDecString(feedInt, dec) {
    const s = feedInt.toString().padStart(dec + 1, '0');
    const head = s.slice(0, -dec) || '0';
    const tail = s.slice(-dec);
    return `${head}.${tail}`;
}

function roundToTick(x, tick) {
    const m = x % tick;
    return m === 0n ? x : x + (tick - m); // ceil to next tick so we are clearly beyond
}

(async () => {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const abi = JSON.parse(await readFile(abs, 'utf8')).abi;

    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, abi, provider);

    // Figure user
    let user = USER;
    if (!user) {
        if (!PK) {
            console.error('Provide USER explicitly or set PRIVATE_KEY to infer it.');
            process.exit(1);
        }
        user = await new Wallet(PK, provider).getAddress();
    }

    // Pull tuple via getAllUserPositions(user) and index by UI index
    const list = await engine.getAllUserPositions(user);
    if (UI_IDX < 0 || UI_IDX >= list.length) {
        console.error(`UI index ${UI_IDX} out of range. Total positions: ${list.length}`);
        process.exit(1);
    }
    const pos = list[UI_IDX];

    // Parse fields defensively (ethers v6 returns array-style)
    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const tpFeed = BigInt(pos[12] || 0);
    const slFeed = BigInt(pos[13] || 0);
    const isOpen = Boolean(pos[8]);

    if (!isOpen) {
        console.log(`UI ${UI_IDX}: position is closed.`);
        process.exit(0);
    }
    if (pair.toUpperCase() !== BASE) {
        console.log(`UI ${UI_IDX}: pair in tuple is ${pair}, not ${BASE}. (Proceeding anyway.)`);
    }

    const minTick = BigInt(await engine.MIN_PRICE_MOVEMENT());
    const bufRaw = BigInt(await engine.priceTriggerBuffer()); // engine-defined units (these should be feed units)
    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const dec = Number(await feed.decimals());
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const now = Math.floor(Date.now() / 1000);
    const age = now - Number(updatedAt);

    // build targets
    const tpExact = tpFeed;
    const slExact = slFeed;

    // treat buffer in same units as feed; ensure we stay on tick grid
    const tpPlusBuf = roundToTick(tpFeed + bufRaw, minTick);
    const tpMinusBuf = roundToTick(tpFeed - (tpFeed >= bufRaw ? bufRaw : 0n), minTick);
    const slPlusBuf = roundToTick(slFeed + bufRaw, minTick);
    const slMinusBuf = roundToTick(slFeed - (slFeed >= bufRaw ? bufRaw : 0n), minTick);

    console.log('ENGINE :', ENGINE);
    console.log('USER   :', user);
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_IDX);
    console.log('isLong :', isLong);
    console.log('tick   :', minTick.toString(), '(feed units)');
    console.log('buffer :', bufRaw.toString(), '(feed units; engine trigger buffer)');
    console.log('feed d :', dec);
    console.log('live   :', feedToDecString(BigInt(answer), dec), `(age=${age}s)`);

    console.log('\n--- Trigger targets (paste into pushGbpOnce.js) ---');
    console.log(`TP exact        => ${feedToDecString(tpExact, dec)}   (feed=${tpExact})`);
    console.log(`TP + buffer     => ${feedToDecString(tpPlusBuf, dec)}   (feed=${tpPlusBuf})`);
    console.log(`TP - buffer     => ${feedToDecString(tpMinusBuf, dec)}   (feed=${tpMinusBuf})`);
    console.log(`SL exact        => ${feedToDecString(slExact, dec)}   (feed=${slExact})`);
    console.log(`SL + buffer     => ${feedToDecString(slPlusBuf, dec)}   (feed=${slPlusBuf})`);
    console.log(`SL - buffer     => ${feedToDecString(slMinusBuf, dec)}   (feed=${slMinusBuf})`);

    console.log('\nNote: keep the feed FRESH (age small) while trying the keeper.');
})();
