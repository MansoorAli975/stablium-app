// script/checkCode.js
import 'dotenv/config';
import { ethers } from 'ethers';

const { SEPOLIA_RPC_URL, EUR_FEED } = process.env;

async function main() {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const code = await provider.getCode(EUR_FEED);
    console.log('EUR_FEED:', EUR_FEED);
    console.log('bytecode length:', (code === '0x') ? 0 : (code.length - 2) / 2);
    console.log('bytecode (first 20 bytes):', code.slice(0, 42));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
