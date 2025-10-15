// script/pushAllRandom.js  (ESM, ethers v6)
// Keeps EUR/GBP/JPY MockV3Aggregator feeds fresh with tiny random-walk updates.
// Env: SEPOLIA_RPC_URL, PRIVATE_KEY
import 'dotenv/config';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const FEEDS = {
    EUR: '0x79cE6945D82f2E024A8555632411e6Bd38667fA7',
    GBP: '0x5bc612F21D49325c54E5C7a3c106adce3e07333F',
    JPY: '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B',
};

const ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
    'function updateAnswer(int256 _answer)',
];

const TICK_MS = 30000;     // ~30s loop
const STALE_S = 90;        // push if older than 90s (keep well under your on-chain timeout)
const JITTER_BP = 2;       // ±0.02% per push (super tiny)

// helpers
const nowSec = () => Math.floor(Date.now() / 1000);

function toScaled8(s) {
    const [i, fRaw = ''] = String(s).split('.');
    const f = (fRaw + '00000000').slice(0, 8);
    const str = `${i}${f}`.replace(/^(-?)0+(?=\d)/, '$1');
    return BigInt(str || '0');
}
function fromScaled8(n) {
    const s = n.toString();
    const pad = s.padStart(9, '0');
    const head = pad.slice(0, pad.length - 8);
    const tail = pad.slice(-8);
    return `${head}.${tail}`;
}
function jitter(human, bp = JITTER_BP) {
    const sign = Math.random() < 0.5 ? -1 : 1;
    const drift = 1 + sign * (bp / 10000);
    const v = parseFloat(human) * drift;
    return v.toFixed(8);
}

async function main() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    const pk = process.env.PRIVATE_KEY;
    if (!rpc || !pk) {
        console.error('Missing SEPOLIA_RPC_URL or PRIVATE_KEY');
        process.exit(1);
    }

    const provider = new JsonRpcProvider(rpc);
    const wallet = new Wallet(pk, provider);
    const feeds = Object.fromEntries(
        Object.entries(FEEDS).map(([k, addr]) => [k, new Contract(addr, ABI, wallet)])
    );

    async function maybePush(symbol, contract) {
        const { answer, updatedAt } = await contract.latestRoundData();
        const age = nowSec() - Number(updatedAt);
        const human = fromScaled8(answer);

        if (age <= STALE_S) {
            console.log(`${symbol} age=${age}s OK  price=${human}`);
            return;
        }

        const next = jitter(human, JITTER_BP);
        try {
            const tx = await contract.updateAnswer(toScaled8(next));
            console.log(`→ push ${symbol}: ${human} → ${next} (age ${age}s) tx=${tx.hash}`);
            await tx.wait();
        } catch (e) {
            console.error(`push ${symbol} error:`, e?.reason || e?.message || e);
        }
    }

    console.log(`Starting price keeper: tick=${TICK_MS / 1000}s, stale>${STALE_S}s, jitter=±${JITTER_BP}bp`);
    async function tick() {
        await Promise.all([
            maybePush('EUR', feeds.EUR),
            maybePush('GBP', feeds.GBP),
            maybePush('JPY', feeds.JPY),
        ]);
    }

    await tick();
    setInterval(tick, TICK_MS);
}

main().catch(e => { console.error(e); process.exit(1); });
