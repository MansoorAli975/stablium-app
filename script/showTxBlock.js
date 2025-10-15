// ESM, ethers v6 — prints the tx's blockNumber and the current latest
import 'dotenv/config';
import { JsonRpcProvider } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const txHash = process.argv[2];
if (!RPC || !txHash) {
    console.error('Usage: node script/showTxBlock.js <txHash>');
    process.exit(1);
}

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt) {
        console.error('No receipt yet; is the tx mined?');
        process.exit(1);
    }
    const latest = await provider.getBlockNumber();
    console.log('tx block   :', rcpt.blockNumber);
    console.log('latest     :', latest);
    console.log('suggested LOOKBACK_BLOCKS ~', Math.max(2000, latest - rcpt.blockNumber + 2000));
})();
