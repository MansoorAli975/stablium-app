import 'dotenv/config';
import { ethers } from 'ethers';

const { SEPOLIA_RPC_URL, PRIVATE_KEY, EUR_FEED } = process.env;

const IFACE = new ethers.Interface([
    'function updateAnswer(int256 _answer)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
    'function decimals() view returns (uint8)'
]);

async function main() {
    const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
    const signer = new ethers.Wallet(PRIVATE_KEY, provider);

    const feed = new ethers.Contract(EUR_FEED, IFACE, signer);

    // target a sensible EUR/USD with 8 decimals, e.g. 1.08536 => 108536000
    const priceInt = 108536000n;

    // show before
    const before = await feed.latestRoundData();
    console.log('Before:', before);

    // bump fees a little so replacement issues don’t bite
    const fd = await provider.getFeeData();
    const maxPriorityFeePerGas = (fd.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei')) * 13n / 10n;
    const maxFeePerGas = (fd.maxFeePerGas ?? ethers.parseUnits('3', 'gwei')) * 13n / 10n;

    const tx = await feed.updateAnswer(priceInt, { maxPriorityFeePerGas, maxFeePerGas });
    console.log('Sent tx:', tx.hash);
    await tx.wait();

    const after = await feed.latestRoundData();
    console.log('After:', after);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
