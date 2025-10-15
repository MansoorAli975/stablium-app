// diagQuickFeeds.js (ESM-safe, no artifact import)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';

const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS || '0x1da038c579096b9C11adD7af8429979D703Ae543';
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;

const ENGINE_ABI = [
    'function getSyntheticPriceFeed(string) view returns (address)'
];
const FEED_ABI = [
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)'
];

const now = () => Math.floor(Date.now() / 1000);

async function dump(sym, engine, provider) {
    const feedAddr = await engine.getSyntheticPriceFeed(sym);
    if (feedAddr === '0x0000000000000000000000000000000000000000') {
        console.log(`${sym}: NO FEED SET`);
        return;
    }
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const dec = await feed.decimals();
    const age = now() - Number(updatedAt);
    console.log(`${sym}: feed=${feedAddr} dec=${dec} price=${answer} updatedAt=${updatedAt} age=${age}s`);
}

async function main() {
    if (!RPC) throw new Error('Missing RPC (VITE_RPC_URL / SEPOLIA_RPC_URL)');
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ENGINE_ABI, provider);
    console.log(`Engine: ${ENGINE}`);
    await dump('EUR', engine, provider);
    await dump('GBP', engine, provider);
    await dump('JPY', engine, provider);
}
main().catch(e => { console.error(e); process.exit(1); });
