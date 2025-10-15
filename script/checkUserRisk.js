// script/checkUserRisk.js
// Read-only: prints user margin ratio and whether a liquidation would succeed via static call
// ethers v6
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { JsonRpcProvider, Contract, formatUnits } from 'ethers';

function loadAbi() {
    const p =
        process.env.ENGINE_ABI_PATH ||
        'out/ForexEngine.sol/ForexEngine.json'; // your repo path
    const abs = path.resolve(p);
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
    const abi = raw.abi || raw; // handle both full artifact and abi-only
    return { abi, abs };
}

function pct(bpsLike) {
    // bpsLike can be BigInt or number
    const n = Number(bpsLike ?? 0);
    return `${(n / 100).toFixed(2)}%`;
}

async function main() {
    const RPC =
        process.env.VITE_RPC_URL ||
        process.env.SEPOLIA_RPC_URL ||
        process.env.RPC_URL;
    const ENGINE =
        process.env.VITE_ENGINE_ADDRESS ||
        process.env.ENGINE_ADDRESS;

    const user = (process.argv[2] || process.env.TRADER || '').trim();

    if (!RPC || !ENGINE || !user) {
        console.error(
            'Missing env/args. Need VITE_RPC_URL (or SEPOLIA_RPC_URL), VITE_ENGINE_ADDRESS (or ENGINE_ADDRESS), and user address (arg or TRADER env).'
        );
        process.exit(1);
    }

    const { abi, abs } = loadAbi();
    console.log('Engine:', ENGINE);
    console.log('ABI   :', abs);
    console.log('User  :', user);

    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, abi, provider);

    // Read flags / params
    let paused = false, breaker = false;
    let initBps = null, minBps = null, maxLev = null;

    try { paused = await engine.isContractPaused(); } catch { }
    try { breaker = await engine.isCircuitBreakerTriggered(); } catch { }
    try { initBps = await engine.INITIAL_MARGIN_PERCENT(); } catch { }
    try { minBps = await engine.MIN_MARGIN_PERCENT(); } catch { }
    try { maxLev = await engine.MAX_LEVERAGE(); } catch { }

    // User margin ratio (bps)
    let userMrBps = null;
    try {
        const mr = await engine.getUserMarginRatio(user);
        // getUserMarginRatio may return bps (uint256). If it’s 1e18 scaled, it’ll look huge.
        // We’ll print both raw and an interpreted % (bps assumption).
        userMrBps = mr;
    } catch (e) {
        console.log('getUserMarginRatio() not callable:', e?.message || e);
    }

    console.log('\n=== Risk / Status ===');
    console.log('isContractPaused         :', Boolean(paused));
    console.log('isCircuitBreakerTriggered:', Boolean(breaker));
    if (initBps != null) console.log('INITIAL_MARGIN_PERCENT   :', `${initBps} bps = ${pct(initBps)}`);
    if (minBps != null) console.log('MIN_MARGIN_PERCENT       :', `${minBps} bps = ${pct(minBps)}`);
    if (maxLev != null) console.log('MAX_LEVERAGE             :', `${maxLev} x`);

    if (userMrBps != null) {
        const asNum = Number(userMrBps);
        const maybePct = Number.isFinite(asNum) ? `${(asNum / 100).toFixed(2)}%` : '(non-numeric)';
        console.log('\nUser margin ratio (raw)  :', String(userMrBps));
        console.log('User margin ratio (bps?) :', maybePct, '(assuming bps)');
    }

    // Dry-run liquidation: if this static call succeeds, a real tx would succeed (i.e., liquidatable).
    let liquidatable = null;
    try {
        // ethers v6: use the staticCall variant
        // If non-liquidatable, most engines revert; if liquidatable, static call resolves.
        await engine.checkAndLiquidate.staticCall(user);
        liquidatable = true;
    } catch (e) {
        // If it reverts with a specific reason like "NotLiquidatable", that’s expected.
        liquidatable = false;
    }

    console.log('\nLiquidation (static call):', liquidatable ? 'WOULD SUCCEED (LIQUIDATABLE)' : 'would revert (NOT liquidatable)');

    // Optional: TP/SL trigger check for every open index you’re tracking would require index IDs.
    // If you want a single index test:
    const idxArg = process.argv[3]; // optional
    if (idxArg) {
        try {
            await engine.checkTpSlAndClose.staticCall(BigInt(idxArg));
            console.log(`TP/SL check (index ${idxArg}): WOULD SUCCEED (trigger present)`);
        } catch {
            console.log(`TP/SL check (index ${idxArg}): would revert (no trigger / not hit)`);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
