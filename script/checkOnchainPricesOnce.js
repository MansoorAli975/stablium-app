// script/checkOnchainPricesOnce.js
// ESM, ethers v6 — checks mock feeds & engine-derived prices once
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Contract } from 'ethers';

const FEEDS = {
    EUR: process.env.EUR_FEED || '0x79cE6945D82f2E024A8555632411e6Bd38667fA7',
    GBP: process.env.GBP_FEED || '0x5bc612F21D49325c54E5C7a3c106adce3e07333F',
    JPY: process.env.JPY_FEED || '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B',
};

const FEED_ABI = [
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)',
];

const ENGINE_ADDR = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;

if (!ENGINE_ADDR || !RPC) {
    console.error('Missing VITE/ENGINE_ADDRESS or RPC url in env.');
    process.exit(1);
}
const engineAbi = JSON.parse(readFileSync(ABI_PATH, 'utf8')).abi;

const nowSec = () => Math.floor(Date.now() / 1000);

function fmt(nBig, decimalsNum) {
    // ensure decimals is a Number (ethers v6 may return BigInt)
    const decimals = Number(decimalsNum);
    const neg = nBig < 0n ? '-' : '';
    let s = (nBig < 0n ? -nBig : nBig).toString();
    if (decimals === 0) return neg + s;
    if (s.length <= decimals) s = s.padStart(decimals + 1, '0');
    const i = s.slice(0, -decimals);
    const f = s.slice(-decimals).replace(/0+$/, '');
    return neg + (f ? `${i}.${f}` : i);
}

function fmt1e18(nBig) {
    return fmt(nBig, 18);
}

async function main() {
    const provider = new JsonRpcProvider(RPC);

    // --- Feeds ---
    console.log('--- FEEDS (answer & age) ---');
    for (const [sym, addr] of Object.entries(FEEDS)) {
        const feed = new Contract(addr, FEED_ABI, provider);
        const dec = await feed.decimals();                         // may be BigInt
        const [, answer, , updatedAt] = await feed.latestRoundData(); // BigInts
        const age = nowSec() - Number(updatedAt);
        console.log(
            `${sym}/USD feed: ${fmt(answer, dec)}  | age=${age}s  | addr=${addr}`
        );
    }

    // --- Engine derived ---
    const engine = new Contract(ENGINE_ADDR, engineAbi, provider);
    console.log('\n--- ENGINE getDerivedPrice(base,"USD") (1e18) ---');
    for (const base of ['EUR', 'GBP', 'JPY']) {
        try {
            const p = await engine.getDerivedPrice(base, 'USD'); // returns BigInt 1e18
            console.log(`${base}/USD engine: ${fmt1e18(p)}  (1e18)`);
        } catch (e) {
            console.log(`${base}/USD engine: ERROR -> ${e.shortMessage || e.message || e}`);
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
