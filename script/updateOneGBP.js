// updateOneGBP.js  (ESM, ethers v6)
// Usage examples:
//   node script/updateOneGBP.js            # uses default 1.26536000
//   node script/updateOneGBP.js 1.27125    # custom price
//
// Env needed: SEPOLIA_RPC_URL, PRIVATE_KEY
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const FEED_GBP = '0x5bc612F21D49325c54E5C7a3c106adce3e07333F'; // MockV3Aggregator (8 decimals)

// Minimal ABI for Chainlink MockV3Aggregator we need
const ABI = [
    // function latestRoundData() public view returns (uint80, int256, uint256, uint256, uint80)
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    // function updateAnswer(int256 _answer) external
    'function updateAnswer(int256 _answer)',
];

// Convert human price string (e.g. "1.26536") to 8-decimal scaled bigint (e.g. 126536000)
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

    // Default GBP/USD if not provided: 1.26536000
    const humanPrice = process.argv[2] ?? '1.26536';
    const scaled = toScaled8(humanPrice);

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const feed = new Contract(FEED_GBP, ABI, wallet);

    const before = await feed.latestRoundData();
    console.log('Before:', fmtRoundData(before));

    const tx = await feed.updateAnswer(scaled);
    console.log('Sent tx:', tx.hash);
    const receipt = await tx.wait();

    const after = await feed.latestRoundData();
    console.log('After:', fmtRoundData(after));

    if (receipt && receipt.status === 1) {
        console.log(`✔ GBP feed updated to ${humanPrice} (scaled ${scaled})`);
    } else {
        console.log('⚠ Transaction did not succeed.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
