import 'dotenv/config';
import { ethers } from 'ethers';

const { SEPOLIA_RPC_URL, EUR_FEED } = process.env;

const AGG_IFACE = new ethers.Interface([
    'function decimals() view returns (uint8)',
    'function description() view returns (string)',
    'function version() view returns (uint256)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'
]);

async function main() {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const feed = new ethers.Contract(EUR_FEED, AGG_IFACE, provider);

    const [dec, desc, ver, lrd] = await Promise.all([
        feed.decimals().catch(e => `ERR: ${e.shortMessage || e.message}`),
        feed.description().catch(e => `ERR: ${e.shortMessage || e.message}`),
        feed.version().catch(e => `ERR: ${e.shortMessage || e.message}`),
        feed.latestRoundData().catch(e => ({ err: e.shortMessage || e.message }))
    ]);

    console.log('EUR_FEED:', EUR_FEED);
    console.log('decimals:', dec);
    console.log('description:', desc);
    console.log('version:', ver);
    console.log('latestRoundData:', lrd);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
