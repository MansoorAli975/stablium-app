// script/suggestTriggerTargets.js
// ESM, ethers v6 — prints TP/SL for a given UI index and suggests ±1 tick push targets.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const ENGINE_ADDR = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const PK = process.env.PRIVATE_KEY; // trader key (same wallet that owns the position)

if (!RPC || !ENGINE_ADDR || !PK) {
    console.error('Missing RPC, ENGINE address, or PRIVATE_KEY.');
    console.error('Usage: node script/suggestTriggerTargets.js <BASE> <UI_INDEX>');
    process.exit(1);
}

const BASE = String(process.argv[2] || '').toUpperCase();
const UI_INDEX = Number(process.argv[3]);

if (!BASE || !Number.isInteger(UI_INDEX) || UI_INDEX < 0) {
    console.error('Usage: node script/suggestTriggerTargets.js <BASE> <UI_INDEX>');
    process.exit(1);
}

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

function humanFromFeed(feedInt, dec) {
    const s = feedInt.toString();
    if (dec === 0) return s;
    const need = dec - s.length;
    const padded = need >= 0 ? ('0'.repeat(need + 1) + s) : s;
    const i = padded.length - dec;
    return padded.slice(0, i) + '.' + padded.slice(i);
}

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE_ADDR, ABI, wallet);

    const me = await wallet.getAddress();
    console.log('Engine :', ENGINE_ADDR);
    console.log('RPC    :', RPC);
    console.log('Caller :', me);
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_INDEX);

    const all = await engine.getAllUserPositions(me);
    if (UI_INDEX >= all.length) {
        console.error(`UI index ${UI_INDEX} out of range; user has ${all.length} positions.`);
        process.exit(1);
    }

    const pos = all[UI_INDEX];
    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const tpFeed = BigInt(pos[12] ?? 0n);
    const slFeed = BigInt(pos[13] ?? 0n);
    const isOpen = Boolean(pos[8]);

    if (!isOpen) {
        console.error('This position is already closed.');
        process.exit(1);
    }
    if (pair !== BASE) {
        console.error(`UI index ${UI_INDEX} is ${pair}, not ${BASE}.`);
        process.exit(1);
    }

    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    if (!feedAddr) {
        console.error(`No feed configured for ${BASE}`);
        process.exit(1);
    }
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const dec = Number(await feed.decimals());
    const tick = await engine.MIN_PRICE_MOVEMENT(); // integer "units" in the feed scale
    const tickFeed = BigInt(tick);                  // e.g. 5 when dec=8 -> 0.00000005

    console.log('\n--- Position ---');
    console.log('pair      :', pair);
    console.log('isLong    :', isLong);
    console.log('tpFeed    :', tpFeed.toString());
    console.log('slFeed    :', slFeed.toString());
    console.log('decimals  :', dec);
    console.log('tick(feed):', tickFeed.toString());

    const now1e18 = BigInt(await engine.getDerivedPrice(BASE, 'USD'));
    const scale = 10n ** BigInt(dec);
    const nowFeed = (now1e18 * scale) / (10n ** 18n);
    console.log('\n--- Live ---');
    console.log('now(feed) :', nowFeed.toString(), '≈', humanFromFeed(nowFeed, dec));

    const suggestions = [];
    if (tpFeed > 0n) {
        suggestions.push({
            label: 'TP exact',
            feed: tpFeed,
            human: humanFromFeed(tpFeed, dec)
        });
        suggestions.push({
            label: 'TP +1tick',
            feed: tpFeed + tickFeed,
            human: humanFromFeed(tpFeed + tickFeed, dec)
        });
        suggestions.push({
            label: 'TP -1tick',
            feed: tpFeed - tickFeed,
            human: humanFromFeed(tpFeed - tickFeed, dec)
        });
    }
    if (slFeed > 0n) {
        suggestions.push({
            label: 'SL exact',
            feed: slFeed,
            human: humanFromFeed(slFeed, dec)
        });
        suggestions.push({
            label: 'SL +1tick',
            feed: slFeed + tickFeed,
            human: humanFromFeed(slFeed + tickFeed, dec)
        });
        suggestions.push({
            label: 'SL -1tick',
            feed: slFeed - tickFeed,
            human: humanFromFeed(slFeed - tickFeed, dec)
        });
    }

    console.log('\n--- Push targets (copy any into pushGbpOnce.js) ---');
    for (const s of suggestions) {
        console.log(`${s.label.padEnd(10)} => ${s.human}   (feed=${s.feed})`);
    }

    console.log('\nNote: Try TP exact first; if engine still says PriceNotAtTrigger, try +1 tick and -1 tick.');
})();
