// script/tpSlSweepProbe.js
// ESM, ethers v6 — find which *engine indices* are valid for keeper/manual close
import 'dotenv/config';
import { readFileSync } from 'fs';
import {
    JsonRpcProvider,
    Contract,
    Interface,
    MaxUint256,
} from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER = process.argv[2];              // 0x... (your trader wallet)
const PAIR = (process.argv[3] || 'GBP');   // base symbol, e.g. "GBP"

if (!RPC || !ENGINE || !USER) {
    console.error('Usage: node script/tpSlSweepProbe.js <USER> [PAIR=GBP]');
    process.exit(1);
}

const toJSON = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ABI, provider);
    const iface = new Interface(ABI);

    console.log('[sweep] engine :', ENGINE);
    console.log('[sweep] user   :', USER);
    console.log('[sweep] pair   :', PAIR);

    // 1) Ask the engine for indices it considers "open" for USER+PAIR
    const ids = await engine.getOpenPositionIds(USER, PAIR);
    const list = Array.from(ids, (x) => BigInt(x.toString()));
    console.log('[sweep] engine-reported open indices:', list.map(String).join(', ') || '(none)');

    if (list.length === 0) process.exit(0);

    // 2) Fetch live price (1e18) to try one “reasonable” bound for manual close,
    //    plus try 0 and MaxUint256 to see which the engine wants
    const live1e18 = await engine.getDerivedPrice(PAIR, 'USD');
    console.log(`[sweep] live ${PAIR}/USD (1e18):`, live1e18.toString());

    const candidateBounds = [
        { label: 'zero', val: 0n },
        { label: 'max', val: MaxUint256 },
        { label: 'live1e18', val: live1e18 },
    ];

    // 3) For each engine index, try keeper and manual-close statically; decode precise revert
    for (const idx of list) {
        console.log(`\n[sweep] --- testing engine index=${idx} ---`);

        // a) Keeper path
        try {
            await engine.checkTpSlAndClose.staticCall(idx);
            console.log(`[sweep]   keeper.staticCall OK idx=${idx} (TP/SL triggerable RIGHT NOW)`);
        } catch (e) {
            let decoded = null;
            try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
            if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }
            if (decoded) {
                console.log(`[sweep]   keeper REVERT idx=${idx}:`, decoded.name, toJSON(decoded.args ?? []));
            } else {
                const msg = e?.shortMessage || e?.reason || e?.message || String(e);
                console.log(`[sweep]   keeper REVERT idx=${idx}:`, msg);
            }
        }

        // b) Manual-close path with multiple bounds
        for (const b of candidateBounds) {
            try {
                await engine.closePosition.staticCall(idx, b.val);
                console.log(`[sweep]   close.staticCall OK idx=${idx} bound=${b.label} (${b.val.toString()})`);
            } catch (e) {
                let decoded = null;
                try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
                if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }
                if (decoded) {
                    console.log(`[sweep]   close REVERT idx=${idx} bound=${b.label}:`, decoded.name, toJSON(decoded.args ?? []));
                } else {
                    const msg = e?.shortMessage || e?.reason || e?.message || String(e);
                    console.log(`[sweep]   close REVERT idx=${idx} bound=${b.label}:`, msg);
                }
            }
        }
    }
})();
