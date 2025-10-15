// updateOneJPY.js  (ESM, ethers v6)
// Usage examples:
//   node script/updateOneJPY.js             # uses default 0.00678000
//   node script/updateOneJPY.js 0.00695     # custom price
//
// Env needed: SEPOLIA_RPC_URL, PRIVATE_KEY
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const FEED_JPY = '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B'; // MockV3Aggregator (8 decimals)

// Minimal ABI for Chainlink MockV3Aggregator we need
const ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function updateAnswer(int256 _answer)',
];

// Convert human price string (e.g. "0.00678") to 8-decimal scaled bigint (e.g. 678000)
function toScaled8(priceStr) {
    const [intPart, fracPartRaw = ''] = priceStr.split('.');
    const fracPart = (fracPartRaw + '00000000').slice(0, 8);
    const asStr = `${intPart}${fracPart}`.replace(/^(-?)0+(?=\d)/, '$1'); // keep sign if any
    return BigInt(asStr || '0');
}

function fmtRoundData({ roundId, answer, startedAt, updatedAt, answeredInRound }) {
    return `Result(5) [ ${roundId}n, ${answer}n, ${startedAt}n, ${updatedAt}n, ${answeredInRound}n ]`;
}

async function main() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    const pk = process.env.PRIVATE_KEY;
    if (!rpc || !pk) {
        console.error('Missing SEPOLIA_RPC_URL or PRIVATE_KEY in environment.');
        process.exit(1);
    }

    // Default JPY/USD if not provided: 0.00678000
    const humanPrice = process.argv[2] ?? '0.00678';
    const scaled = toScaled8(humanPrice);

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const feed = new Contract(FEED_JPY, ABI, wallet);

    const before = await feed.latestRoundData();
    console.log('Before:', fmtRoundData(before));

    const tx = await feed.updateAnswer(scaled);
    console.log('Sent tx:', tx.hash);
    const receipt = await tx.wait();

    const after = await feed.latestRoundData();
    console.log('After:', fmtRoundData(after));

    if (receipt && receipt.status === 1) {
        console.log(`✔ JPY feed updated to ${humanPrice} (scaled ${scaled})`);
    } else {
        console.log('⚠ Transaction did not succeed.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
