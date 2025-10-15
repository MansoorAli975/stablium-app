// ESM, ethers v6 — dump buffers, ticks, and live price vs feed scaling
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Contract } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;

const BASE = process.argv[2] || 'GBP';

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'
];

function fmtFeed(x, dec = 8) {
    const s = x.toString().padStart(dec + 1, '0');
    const head = s.slice(0, -dec) || '0';
    const tail = s.slice(-dec);
    return `${head}.${tail}`;
}
function scaleTo1e18(v, dec) {
    const D = Number(dec);
    if (D === 18) return v;
    if (D < 18) return v * 10n ** BigInt(18 - D);
    return v / 10n ** BigInt(D - 18);
}

async function main() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const abi = JSON.parse(await readFile(abs, 'utf8')).abi;

    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, abi, provider);

    const minTick = await engine.MIN_PRICE_MOVEMENT();   // feed units
    const trigBuf = await engine.priceTriggerBuffer();   // feed units? or 1e18? let's log raw
    const decFeedAddr = await engine.getSyntheticPriceFeed(BASE);
    const feed = new Contract(decFeedAddr, FEED_ABI, provider);
    const dec = Number(await feed.decimals());
    const [, answer] = await feed.latestRoundData();
    const feedAns = BigInt(answer);
    const engine1e18 = await engine.getDerivedPrice(BASE, 'USD');

    console.log('ENGINE :', ENGINE);
    console.log('BASE   :', BASE);
    console.log('tick   :', minTick.toString(), '(feed units)');
    console.log('buffer?:', trigBuf.toString(), '(raw units; contract-specific)');
    console.log('feed d :', dec);
    console.log('feed v :', fmtFeed(feedAns, dec), `(raw=${feedAns})`);
    console.log('engine :', engine1e18.toString(), '(1e18)');
    console.log('scaled :', scaleTo1e18(feedAns, dec).toString(), '(feed→1e18)');

    if (scaleTo1e18(feedAns, dec) !== engine1e18) {
        console.log('NOTE: engine derived price != scaled feed. Equality TP checks may fail unless your pusher updates the engine view, not just the feed.');
    }
}

main().catch(e => { console.error(e); process.exit(1); });
