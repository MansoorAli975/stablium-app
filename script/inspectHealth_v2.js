// script/inspectHealth_v2.js (ESM, read-only health inspector)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Contract } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolvePathMaybe(p) {
    if (!p) return null;
    // absolute?
    if (path.isAbsolute(p)) return fs.existsSync(p) ? p : null;
    // relative to CWD first
    const a = path.resolve(process.cwd(), p);
    if (fs.existsSync(a)) return a;
    // relative to this script (just in case)
    const b = path.resolve(__dirname, '..', p);
    if (fs.existsSync(b)) return b;
    return null;
}

function loadAbiJson() {
    const candidates = [
        process.env.ENGINE_ABI_PATH,
        'abis/ForexEngine.json',
        'out/ForexEngine.sol/ForexEngine.json',
    ].filter(Boolean);

    for (const c of candidates) {
        const p = resolvePathMaybe(c);
        if (!p) continue;
        try {
            const raw = fs.readFileSync(p, 'utf8');
            const json = JSON.parse(raw);
            // Foundry-style artifact has .abi; plain ABI files are arrays
            const abi = Array.isArray(json) ? json : (json.abi || json.ABI || null);
            if (abi && Array.isArray(abi)) {
                return { abi, where: p };
            }
        } catch (e) {
            // ignore and try next
        }
    }
    return null;
}

function pickFn(iface, names) {
    for (const n of names) {
        try {
            if (iface.getFunction(n)) return n;
        } catch { }
    }
    return null;
}

function toStrSafe(x) {
    try { return typeof x === 'bigint' ? x.toString() : JSON.stringify(x); }
    catch { return String(x); }
}

async function main() {
    const idxArg = process.argv[2];
    if (!idxArg) {
        console.error('Usage: node script/inspectHealth_v2.js <positionIndex>');
        process.exit(1);
    }
    const index = BigInt(idxArg);

    const rpc =
        process.env.SEPOLIA_RPC_URL ||
        process.env.ANVIL_RPC_URL ||
        process.env.VITE_RPC_URL;
    const engineAddr =
        process.env.ENGINE ||
        process.env.VITE_ENGINE_ADDRESS ||
        process.env.ENGINE_ADDRESS;

    if (!rpc) {
        console.error('❌ Missing RPC URL (set SEPOLIA_RPC_URL or VITE_RPC_URL)');
        process.exit(1);
    }
    if (!engineAddr) {
        console.error('❌ Missing ENGINE address (set VITE_ENGINE_ADDRESS or ENGINE)');
        process.exit(1);
    }

    const abiLoad = loadAbiJson();
    if (!abiLoad) {
        console.error('❌ Could not find your engine ABI. Set ENGINE_ABI_PATH to the JSON your frontend uses');
        process.exit(1);
    }

    const { abi, where } = abiLoad;
    const provider = new JsonRpcProvider(rpc);
    const engine = new Contract(engineAddr, abi, provider);

    console.log(`Engine: ${engineAddr}`);
    console.log(`ABI   : ${where}`);
    console.log(`Index : ${index.toString()}`);

    // Detect functions present in your ABI
    const mmBpsFn = pickFn(engine.interface, [
        'maintenanceMarginBps',
        'getMaintenanceMarginBps',
        'maintenanceMarginBasisPoints',
        'maintenanceMarginRateBps',
    ]);

    const posFn = pickFn(engine.interface, [
        // common patterns
        'getPosition(uint256)',
        'getPosition(int256)',
        'getPosition(bytes32)',
        'positions(uint256)',
        'positions(int256)',
        'positions(bytes32)',
        'getTrade(uint256)',
        'trades(uint256)',
        'openPositions(uint256)',
    ]);

    const liqFn = pickFn(engine.interface, [
        'isLiquidatable(uint256)',
        'canLiquidate(uint256)',
        'wouldLiquidate(uint256)',
        'checkLiquidation(uint256)',
    ]);

    const healthFn = pickFn(engine.interface, [
        'getPositionHealth(uint256)',
        'positionHealth(uint256)',
        'health(uint256)',
    ]);

    // 1) Maintenance margin
    try {
        if (mmBpsFn) {
            const mmBps = await engine[mmBpsFn]();
            console.log(`maintenanceMarginBps: ${mmBps.toString()} (${Number(mmBps) / 100}% )`);
        } else {
            console.log('maintenanceMarginBps: <not found in ABI>');
        }
    } catch (e) {
        console.log('maintenanceMarginBps: <call failed>', e?.shortMessage || e?.message || e);
    }

    // 2) Raw position
    try {
        if (posFn) {
            const pos = await engine[posFn](index);
            console.log(`Position(${posFn}):`);
            // Try to pretty print common fields if they exist
            if (pos && typeof pos === 'object') {
                const entries = Object.entries(pos).filter(([k]) => isNaN(Number(k))); // skip numeric indices
                for (const [k, v] of entries) {
                    console.log(`  ${k}: ${toStrSafe(v)}`);
                }
            } else {
                console.log('  ', toStrSafe(pos));
            }
        } else {
            console.log('Position: <no position getter found in ABI>');
        }
    } catch (e) {
        console.log('Position: <read failed>', e?.shortMessage || e?.message || e);
    }

    // 3) Health (if provided)
    try {
        if (healthFn) {
            const health = await engine[healthFn](index);
            console.log(`Health(${healthFn}): ${toStrSafe(health)}`);
        } else {
            console.log('Health: <no health view in ABI>');
        }
    } catch (e) {
        console.log('Health: <read failed>', e?.shortMessage || e?.message || e);
    }

    // 4) Liquidation check
    try {
        if (liqFn) {
            const can = await engine[liqFn](index);
            console.log(`Liquidatable(${liqFn}): ${toStrSafe(can)}`);
        } else {
            console.log('Liquidatable: <no liquidation check in ABI>');
        }
    } catch (e) {
        console.log('Liquidatable: <read failed>', e?.shortMessage || e?.message || e);
    }
}

main().catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
});
