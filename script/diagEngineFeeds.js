// script/diagEngineFeeds.js (ESM-safe without import assertions)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const engineArtifact = require('../out/ForexEngine.sol/ForexEngine.json');

const ENGINE = process.env.ENGINE_ADDRESS || process.env.VITE_ENGINE_ADDRESS || '0x1da038c579096b9C11adD7af8429979D703Ae543';
const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;

const ENGINE_ABI = engineArtifact.abi;
const FEED_ABI = [
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)',
];

const nowSec = () => Math.floor(Date.now() / 1000);

async function dump(symbol, engine, provider) {
    const feedAddr = await engine.getSyntheticPriceFeed(symbol);
    if (feedAddr === '0x0000000000000000000000000000000000000000') {
        console.log(`${symbol}: NO FEED SET`);
        return;
    }
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const dec = await feed.decimals();
    const age = nowSec() - Number(updatedAt);
    console.log(`${symbol}: feed=${feedAddr} decimals=${dec} price=${answer} updatedAt=${updatedAt} age=${age}s`);
}

(async () => {
    if (!RPC) throw new Error('Missing SEPOLIA_RPC_URL / VITE_RPC_URL');
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ENGINE_ABI, provider);

    console.log(`Engine: ${ENGINE}`);
    await dump('EUR', engine, provider);
    await dump('GBP', engine, provider);
    await dump('JPY', engine, provider);

    console.log('\n.env feeds (what your push scripts target):');
    console.log('EUR_FEED=', process.env.EUR_FEED);
    console.log('GBP_FEED=', process.env.GBP_FEED);
    console.log('JPY_FEED=', process.env.JPY_FEED);
})().catch(e => { console.error(e); process.exit(1); });
