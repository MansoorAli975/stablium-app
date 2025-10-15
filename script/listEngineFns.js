// script/listEngineFns.js  (ESM)
// Lists all function names in your Engine ABI and highlights likely candidates.
// Also tries to call a few common zero-arg status views (if present).

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Contract } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePathMaybe(p) {
    if (!p) return null;
    if (path.isAbsolute(p)) return fs.existsSync(p) ? p : null;
    const a = path.resolve(process.cwd(), p);
    if (fs.existsSync(a)) return a;
    const b = path.resolve(__dirname, '..', p);
    if (fs.existsSync(b)) return b;
    return null;
}

function loadAbiJson() {
    const candidates = [
        process.env.ENGINE_ABI_PATH,
        'abis/ForexEngine.json',
        'out/ForexEngine.sol/ForexEngine.json',
        'out/ForexEngine.sol/ForexEngine.json',
        'out/ShowPositions.s.sol/IEngineView.json',
        'abis/DSCEngineABI.json',
    ].filter(Boolean);

    for (const c of candidates) {
        const p = resolvePathMaybe(c);
        if (!p) continue;
        try {
            const raw = fs.readFileSync(p, 'utf8');
            const json = JSON.parse(raw);
            const abi = Array.isArray(json) ? json : (json.abi || json.ABI || null);
            if (abi && Array.isArray(abi)) return { abi, where: p };
        } catch { }
    }
    return null;
}

function toSig(fn) {
    const inputs = fn.inputs?.map(i => i.type).join(',') || '';
    return `${fn.name}(${inputs})`;
}

function looksLike(name, kws) {
    const l = name.toLowerCase();
    return kws.some(k => l.includes(k));
}

async function main() {
    const rpc =
        process.env.SEPOLIA_RPC_URL ||
        process.env.ANVIL_RPC_URL ||
        process.env.VITE_RPC_URL;
    const engineAddr =
        process.env.ENGINE ||
        process.env.VITE_ENGINE_ADDRESS ||
        process.env.ENGINE_ADDRESS;

    if (!rpc) {
        console.error('❌ Missing RPC URL (SEPOLIA_RPC_URL or VITE_RPC_URL)');
        process.exit(1);
    }
    if (!engineAddr) {
        console.error('❌ Missing Engine address (VITE_ENGINE_ADDRESS or ENGINE)');
        process.exit(1);
    }

    const abiLoad = loadAbiJson();
    if (!abiLoad) {
        console.error('❌ Could not find your engine ABI. Set ENGINE_ABI_PATH to the JSON your frontend uses.');
        process.exit(1);
    }

    const { abi, where } = abiLoad;
    const provider = new JsonRpcProvider(rpc);
    const engine = new Contract(engineAddr, abi, provider);

    console.log(`Engine: ${engineAddr}`);
    console.log(`ABI   : ${where}\n`);

    // Group functions
    const fns = abi.filter(x => x?.type === 'function');
    const zeroArgViews = [];
    const indexArgViews = [];

    for (const f of fns) {
        const isView = (f.stateMutability === 'view' || f.stateMutability === 'pure');
        const inputs = f.inputs || [];
        if (isView && inputs.length === 0) zeroArgViews.push(f);
        if (isView && inputs.length === 1 && /^(u?int(256)?)|bytes32$/.test(inputs[0].type)) {
            indexArgViews.push(f);
        }
    }

    // Print all functions, flagging likely ones
    console.log('=== All view/pure functions (grouped) ===\n');

    console.log('— Zero-arg views:');
    for (const f of zeroArgViews) {
        const sig = toSig(f);
        const hint = looksLike(f.name, ['margin', 'maint', 'pause', 'breaker', 'health', 'leverage', 'fee', 'oracle']) ? '  ← candidate' : '';
        console.log(`  ${sig}${hint}`);
    }

    console.log('\n— Index-arg views (uint/bytes32):');
    for (const f of indexArgViews) {
        const sig = toSig(f);
        const hint = looksLike(f.name, ['pos', 'position', 'trade', 'order', 'health', 'liq', 'liquid']) ? '  ← candidate' : '';
        console.log(`  ${sig}${hint}`);
    }

    // Try calling a few obvious zero-arg status views if present
    const tryNames = [
        'maintenanceMarginBps',
        'getMaintenanceMarginBps',
        'maintenanceMarginBasisPoints',
        'maintenanceMarginRateBps',
        'isContractPaused',
        'isCircuitBreakerTriggered'
    ];

    console.log('\n=== Quick calls (if present) ===');
    for (const name of tryNames) {
        try {
            if (engine.interface.getFunction(name)) {
                const v = await engine[name]();
                console.log(`${name}: ${typeof v === 'bigint' ? v.toString() : v}`);
            }
        } catch { }
    }

    console.log('\nDone. Pick the correct function names from the lists above, and we will wire the health inspector to them.');
}

main().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});
