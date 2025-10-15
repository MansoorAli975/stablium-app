// script/showTpSlBounds.js
// ESM, ethers v6 — prints current price and the min/max TP/SL allowed by priceTriggerBuffer
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Contract } from 'ethers';

const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;

if (!ENGINE || !RPC) {
    console.error('Missing ENGINE address or RPC in env.');
    process.exit(1);
}

const engineAbi = JSON.parse(readFileSync(ABI_PATH, 'utf8')).abi;

const ONE = 10n ** 18n;
const bpsToRatio1e18 = (bps) => (ONE * BigInt(bps)) / 10_000n; // e.g., 600 bps -> 0.06 * 1e18

function mul1e18(x1e18, y1e18) { return (x1e18 * y1e18) / ONE; }
function add1e18(x1e18, y1e18) { return x1e18 + y1e18; }
function sub1e18(x1e18, y1e18) { return x1e18 - y1e18; }

function fmt1e18(x1e18) {
    const s = x1e18.toString().padStart(19, '0');
    const i = s.slice(0, -18) || '0';
    const f = s.slice(-18).replace(/0+$/, '');
    return f ? `${i}.${f}` : i;
}

async function main() {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, engineAbi, provider);

    const price = await engine.getDerivedPrice('GBP', 'USD'); // 1e18
    const bufferBps = await engine.priceTriggerBuffer();       // uint256
    const ratio = bpsToRatio1e18(Number(bufferBps));           // 1e18 ratio
    // bounds for LONG: TP >= price*(1+ratio), SL <= price*(1-ratio)
    const longMinTP = mul1e18(price, add1e18(ONE, ratio));
    const longMaxSL = mul1e18(price, sub1e18(ONE, ratio));
    // bounds for SHORT: TP <= price*(1-ratio), SL >= price*(1+ratio)
    const shortMaxTP = mul1e18(price, sub1e18(ONE, ratio));
    const shortMinSL = mul1e18(price, add1e18(ONE, ratio));

    console.log('--- Live Bounds (GBP/USD) ---');
    console.log('Price (1e18):     ', price.toString(), '=>', fmt1e18(price));
    console.log('Buffer (bps):     ', bufferBps.toString());
    console.log('');
    console.log('LONG  min TP  >=  ', longMinTP.toString(), '=>', fmt1e18(longMinTP));
    console.log('LONG  max SL  <=  ', longMaxSL.toString(), '=>', fmt1e18(longMaxSL));
    console.log('');
    console.log('SHORT max TP  <=  ', shortMaxTP.toString(), '=>', fmt1e18(shortMaxTP));
    console.log('SHORT min SL  >=  ', shortMinSL.toString(), '=>', fmt1e18(shortMinSL));
    console.log('');
    console.log('Tip: Enter TP/SL in TradePanel using the human values above (5 dp is fine).');
}

main().catch((e) => { console.error(e); process.exit(1); });
