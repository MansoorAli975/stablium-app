// script/inspectRisk.js (ethers v6, ESM)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';
import fs from 'fs';

const ENGINE_ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;

if (!ENGINE || !RPC) {
    console.error('Missing VITE_ENGINE_ADDRESS/ENGINE_ADDRESS or RPC (VITE_RPC_URL/SEPOLIA_RPC_URL).');
    process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(ENGINE_ABI_PATH, 'utf8'));
const abi = raw.abi || raw;

async function main() {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, abi, provider);

    console.log('Engine:', ENGINE);
    console.log('ABI   :', ENGINE_ABI_PATH);

    // Safely read the risk knobs if present
    async function safeRead(name) {
        try { return await engine[name](); }
        catch { return undefined; }
    }

    const paused = await safeRead('isContractPaused');
    const breaker = await safeRead('isCircuitBreakerTriggered');
    const initMarginBps = await safeRead('INITIAL_MARGIN_PERCENT');   // naming from your ABI dump
    const minMarginBps = await safeRead('MIN_MARGIN_PERCENT');
    const maxLev = await safeRead('MAX_LEVERAGE');
    const minLiqBuf = await safeRead('minLiquidationBuffer');
    const priceTrigBuf = await safeRead('priceTriggerBuffer');

    const fmt = (v) => (v == null ? '<n/a>' : String(v));

    console.log('\n=== Risk / Status ===');
    console.log('isContractPaused         :', fmt(paused));
    console.log('isCircuitBreakerTriggered:', fmt(breaker));
    console.log('INITIAL_MARGIN_PERCENT   :', fmt(initMarginBps), 'bps');
    console.log('MIN_MARGIN_PERCENT       :', fmt(minMarginBps), 'bps');
    console.log('MAX_LEVERAGE             :', fmt(maxLev), 'x');
    console.log('minLiquidationBuffer     :', fmt(minLiqBuf));
    console.log('priceTriggerBuffer       :', fmt(priceTrigBuf));
}

main().catch((e) => { console.error(e); process.exit(1); });
