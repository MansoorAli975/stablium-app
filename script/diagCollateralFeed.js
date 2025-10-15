// diagCollateralFeed.js (ESM-safe, no artifact import)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';

const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS || '0x1da038c579096b9C11adD7af8429979D703Ae543';
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const WETH = process.env.VITE_WETH_ADDRESS || process.env.WETH_ADDRESS || '0xdd13E55209Fd76AfE204dBda4007C227904f0a81';

const ENGINE_ABI = [
    'function getPriceFeed(address) view returns (address)'
];
const FEED_ABI = [
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)'
];

const now = () => Math.floor(Date.now() / 1000);

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ENGINE_ABI, provider);

    const feedAddr = await engine.getPriceFeed(WETH);
    console.log('Engine:', ENGINE);
    console.log('WETH  :', WETH);
    console.log('Feed  :', feedAddr);

    if (feedAddr === '0x0000000000000000000000000000000000000000') {
        console.log('❌ No collateral feed set for WETH');
        process.exit(0);
    }

    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const dec = await feed.decimals();
    const age = now() - Number(updatedAt);
    console.log(`dec=${dec} price=${answer} updatedAt=${updatedAt} age=${age}s`);
})();
