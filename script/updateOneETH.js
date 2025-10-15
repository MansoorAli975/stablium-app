// updateOneETH.js (ethers v6, ESM, no import assertions)
// Usage: node script/updateOneETH.js 2500.00
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const FEED = '0xd0947B75F6f85E2a2e2305074e330F306f22dD9f'; // WETH/USD MockV3Aggregator (8 dec)

const ABI = [
    'function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)',
    'function updateAnswer(int256 _answer)',
];

function toScaled8(s) {
    const [i, fRaw = ''] = String(s).split('.');
    const f = (fRaw + '00000000').slice(0, 8);
    const str = `${i}${f}`.replace(/^(-?)0+(?=\d)/, '$1');
    return BigInt(str || '0');
}
const fmt = (r) => `Result(5) [ ${r.roundId}n, ${r.answer}n, ${r.startedAt}n, ${r.updatedAt}n, ${r.answeredInRound}n ]`;

(async () => {
    const rpc = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
    const pk = process.env.PRIVATE_KEY;
    if (!rpc || !pk) throw new Error('Missing RPC or PRIVATE_KEY');
    const price = process.argv[2] ?? '2500.00';

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const feed = new Contract(FEED, ABI, wallet);

    const before = await feed.latestRoundData(); console.log('Before:', fmt(before));
    const tx = await feed.updateAnswer(toScaled8(price)); console.log('Sent tx:', tx.hash);
    await tx.wait();
    const after = await feed.latestRoundData(); console.log('After :', fmt(after));
    console.log(`✔ ETH/USD updated to ${price}`);
})();
