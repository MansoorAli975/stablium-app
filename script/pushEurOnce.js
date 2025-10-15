// script/pushGbpOnce.js
// ESM, ethers v6 — set GBP/USD mock feed to a specific human price (8 dp)
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract, parseUnits } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const PK = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;

// GBP/USD mock feed on Sepolia (from your env summary)
const GBP_FEED = '0x5bc612F21D49325c54E5C7a3c106adce3e07333F';

const FEED_ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function updateAnswer(int256 _answer)',
];

function toScaled8(human) {
    const s = String(human);
    const [i, fRaw = ''] = s.split('.');
    const f = (fRaw + '00000000').slice(0, 8);
    return BigInt((i + f).replace(/^(-?)0+(?=\d)/, '$1') || '0');
}

async function feeBump(provider) {
    const fd = await provider.getFeeData();
    const tip = (fd.maxPriorityFeePerGas ?? parseUnits('1', 'gwei')) + parseUnits('2', 'gwei');
    const max = (fd.maxFeePerGas ?? parseUnits('20', 'gwei')) + parseUnits('2', 'gwei');
    return { maxPriorityFeePerGas: tip, maxFeePerGas: max };
}

async function main() {
    const target = process.argv[2]; // e.g. 1.37000000
    if (!RPC || !PK) throw new Error('Missing RPC or ORACLE/PRIVATE key in env.');
    if (!target) {
        console.error('Usage: node script/pushGbpOnce.js <priceHumanWith8dp>');
        process.exit(1);
    }

    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const feed = new Contract(GBP_FEED, FEED_ABI, wallet);

    const { answer, updatedAt } = await feed.latestRoundData();
    console.log('Current GBP/USD:', (answer.toString().padStart(9, '0')).replace(/(\d{8})$/, '.$1'), 'age(s)=', Math.floor(Date.now() / 1000) - Number(updatedAt));

    const scaled = toScaled8(target);
    const fees = await feeBump(provider);
    const tx = await feed.updateAnswer(scaled, fees);
    console.log('→ push GBP to', target, 'tx=', tx.hash);
    const rc = await tx.wait();
    console.log('✓ confirmed in block', rc.blockNumber);
}

main().catch((e) => { console.error(e); process.exit(1); });
