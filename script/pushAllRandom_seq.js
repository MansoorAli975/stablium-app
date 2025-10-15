// script/pushAllRandom_seq.js (mixed-writer, sequential, ethers v6)
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract, parseUnits } from 'ethers';

const FEEDS = {
    EUR: process.env.EUR_FEED || '0x79cE6945D82f2E024A8555632411e6Bd38667fA7',
    GBP: process.env.GBP_FEED || '0x5bc612F21D49325c54E5C7a3c106adce3e07333F',
    JPY: process.env.JPY_FEED || '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B',
    ETH: process.env.ETH_FEED || '0xd0947B75F6f85E2a2e2305074e330F306f22dD9f', // collateral feed (WETH/USD)
};

const BASE_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    // possible writer variants across your mocks
    'function updateAnswer(int256 _answer)',
    'function setLatestAnswer(int256 _answer)',
    'function updateRoundData(uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt)',
    'function setLatestRoundData(uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt)',
];

const TICK_MS = 10_000; // ~10s
const STALE_S = 90;     // refresh if older than 90s
const JITTER_BP = 4;      //  (±0.04%)

const rpc = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const pk = process.env.ORACLE_PRIVATE_KEY || process.env.PRIVATE_KEY;

if (!rpc || !pk) {
    console.error('Missing SEPOLIA_RPC_URL/VITE_RPC_URL or ORACLE_PRIVATE_KEY/PRIVATE_KEY');
    process.exit(1);
}

const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(pk, provider);

const nowSec = () => Math.floor(Date.now() / 1000);

function toScaled8(s) {
    const [i, fRaw = ''] = String(s).split('.');
    const f = (fRaw + '00000000').slice(0, 8);
    const str = `${i}${f}`.replace(/^(-?)0+(?=\d)/, '$1');
    return BigInt(str || '0');
}
function fromScaled8(n) {
    const s = n.toString().padStart(9, '0');
    return `${s.slice(0, -8)}.${s.slice(-8)}`;
}
function jitter(human, bp = JITTER_BP) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    const drift = 1 + sign * (bp / 10000);
    return (parseFloat(human) * drift).toFixed(8);
}

async function feeBump() {
    const fd = await provider.getFeeData();
    const tip = (fd.maxPriorityFeePerGas ?? parseUnits('1', 'gwei')) + parseUnits('2', 'gwei');
    const max = (fd.maxFeePerGas ?? parseUnits('20', 'gwei')) + parseUnits('2', 'gwei');
    return { maxPriorityFeePerGas: tip, maxFeePerGas: max };
}

// Try all known writer variants on a given feed
async function writePriceMixed(contract, human) {
    const v = toScaled8(human);
    const now = nowSec();
    const fees = await feeBump();

    const attempts = [
        async () => contract.updateAnswer(v, fees),
        async () => contract.setLatestAnswer(v, fees),
        async () => contract.updateRoundData(0, v, now, now, fees),
        async () => contract.setLatestRoundData(0, v, now, now, fees),
    ];

    let lastErr = null;
    for (const tryFn of attempts) {
        try {
            const tx = await tryFn();
            console.log(`   writer ok → tx=${tx.hash}`);
            await tx.wait();
            return true;
        } catch (e) {
            lastErr = e?.shortMessage || e?.message || String(e);
            // keep trying next variant
        }
    }
    console.log('   ❌ all writer variants failed on this feed:', lastErr);
    return false;
}

async function main() {
    const address = await wallet.getAddress();
    console.log('Pusher signer:', address);

    const feeds = Object.fromEntries(
        Object.entries(FEEDS).map(([k, addr]) => [k, new Contract(addr, BASE_ABI, wallet)])
    );

    // anchors — set GBP high enough to meet TP+buffer when we refresh it
    let eur = '1.08560000';
    let gbp = '1.36240000'; // ↑ slightly above your threshold
    let jpy = '0.00678000';
    let eth = '2500.00000000';

    async function maybePushSequential() {
        const snap = {};
        for (const [sym, c] of Object.entries(feeds)) {
            const { answer, updatedAt } = await c.latestRoundData();
            snap[sym] = { price: fromScaled8(answer), age: nowSec() - Number(updatedAt) };
        }

        console.log(
            `EUR age=${snap.EUR.age}s ${snap.EUR.price} | ` +
            `GBP age=${snap.GBP.age}s ${snap.GBP.price} | ` +
            `JPY age=${snap.JPY.age}s ${snap.JPY.price} | ` +
            `ETH age=${snap.ETH.age}s ${snap.ETH.price}`
        );

        // Sequential updates (avoid nonce races) — refresh stale ones
        if (snap.EUR.age > STALE_S) { eur = jitter(eur); console.log(`→ EUR push ${eur}`); await writePriceMixed(feeds.EUR, eur); }
        if (snap.JPY.age > STALE_S) { jpy = jitter(jpy); console.log(`→ JPY push ${jpy}`); await writePriceMixed(feeds.JPY, jpy); }
        if (snap.ETH.age > STALE_S) { eth = jitter(eth); console.log(`→ ETH push ${eth}`); await writePriceMixed(feeds.ETH, eth); }

        // push GBP LAST (trigger feed)
        if (snap.GBP.age > STALE_S) { gbp = jitter(gbp); console.log(`→ GBP push ${gbp}`); await writePriceMixed(feeds.GBP, gbp); }
    }

    console.log(`Keeper (sequential) started: tick=${TICK_MS / 1000}s, stale>${STALE_S}s, jitter=±${JITTER_BP}bp`);
    await maybePushSequential();           // run immediately once
    setInterval(maybePushSequential, TICK_MS);
}

main().catch(e => { console.error(e); process.exit(1); });
