// checkFreshness.js (ESM, ethers v6)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';

// === addresses (from your current setup) ===
const FEED_EUR = '0x79cE6945D82f2E024A8555632411e6Bd38667fA7';
const FEED_GBP = '0x5bc612F21D49325c54E5C7a3c106adce3e07333F';
const FEED_JPY = '0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B';

const ABI = [
    'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
];

function nowSec() { return Math.floor(Date.now() / 1000); }
function fmtAge(s) { return `${s}s (${(s / 60).toFixed(2)}m)`; }

async function dump(provider, name, addr) {
    const c = new Contract(addr, ABI, provider);
    const { roundId, answer, startedAt, updatedAt, answeredInRound } = await c.latestRoundData();
    const age = nowSec() - Number(updatedAt);
    console.log(`\n${name} @ ${addr}`);
    console.log(`roundId=${roundId} answer=${answer} startedAt=${startedAt} updatedAt=${updatedAt} answeredInRound=${answeredInRound}`);
    console.log(`age: ${fmtAge(age)}`);
    if (age > 180) console.log('⚠ Possibly stale (>3 min). Push a new price.');
}

async function main() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) { console.error('Missing SEPOLIA_RPC_URL'); process.exit(1); }
    const provider = new JsonRpcProvider(rpc);

    await dump(provider, 'EUR/USD', FEED_EUR);
    await dump(provider, 'GBP/USD', FEED_GBP);
    await dump(provider, 'JPY/USD', FEED_JPY);

    console.log('\nTip: your StalePrice guard compares (block.timestamp - updatedAt) to a TIMEOUT constant. Ensure age stays below that threshold.');
}

main().catch(e => { console.error(e); process.exit(1); });
