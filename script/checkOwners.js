// script/checkOwners.js
import 'dotenv/config';
import { ethers } from 'ethers';

const { SEPOLIA_RPC_URL, PRIVATE_KEY, EUR_FEED, GBP_FEED, JPY_FEED } = process.env;

const iface = new ethers.Interface([
    'function owner() view returns (address)',
]);

async function main() {
    if (!SEPOLIA_RPC_URL || !PRIVATE_KEY || !EUR_FEED || !GBP_FEED || !JPY_FEED) {
        throw new Error('Missing one of: SEPOLIA_RPC_URL, PRIVATE_KEY, EUR_FEED, GBP_FEED, JPY_FEED');
    }

    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log('Using key address:', wallet.address);
    for (const [label, addr] of Object.entries({ EUR_FEED, GBP_FEED, JPY_FEED })) {
        const data = iface.encodeFunctionData('owner', []);
        const ret = await provider.call({ to: addr, data });
        const [owner] = iface.decodeFunctionResult('owner', ret);
        console.log(`${label} owner: ${owner} (${addr})`);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
