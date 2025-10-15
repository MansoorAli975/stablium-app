// script/tpSlProbe.js
// ESM, ethers v6 — probes which index works for TP/SL close
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract, Interface, MaxUint256 } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER_PK = process.env.PRIVATE_KEY;
const USER_ADDR = process.env.USER_ADDRESS || process.argv[2] || '';
const PAIR = (process.env.PAIR || process.argv[3] || 'GBP').toUpperCase();  // EUR/GBP/JPY
const USER_IDX = process.argv[4]; // optional: per-user array index you think (e.g. 16)

if (!RPC || !ENGINE || !USER_PK || !USER_ADDR) {
    console.error('Usage: USER_ADDRESS=0x.. [PAIR=GBP] node script/tpSlProbe.js [USER_ADDRESS] [PAIR] [USER_IDX]');
    console.error('Missing RPC/ENGINE/PRIVATE_KEY/USER_ADDRESS in env.');
    process.exit(1);
}

function decodeError(iface, e) {
    try { return iface.parseError(e?.data || e?.error?.data || e); } catch { return null; }
}
function toNum1e18(x) { try { return Number(x) / 1e18; } catch { return NaN; } }

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(USER_PK, provider);
    const engine = new Contract(ENGINE, ABI, wallet);
    const iface = new Interface(ABI);

    console.log('[probe] engine:', ENGINE);
    console.log('[probe] user  :', USER_ADDR);
    console.log('[probe] pair  :', PAIR);

    // gather context
    const openIds = await engine.getOpenPositionIds(USER_ADDR, PAIR).catch(() => []);
    console.log('[probe] getOpenPositionIds ->', openIds.map(x => x.toString()));

    const list = await engine.getAllUserPositions(USER_ADDR);
    // collect user-array indices that belong to PAIR and are open
    const userIdxs = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const isOpen = Boolean(p[8]);
        const pr = String(p[1]).toUpperCase();
        if (isOpen && pr === PAIR) userIdxs.push(i);
    }
    if (USER_IDX && !userIdxs.includes(Number(USER_IDX))) userIdxs.push(Number(USER_IDX));
    console.log('[probe] user-array indices for pair that are open ->', userIdxs);

    // get current price for reference
    const curr1e18 = await engine.getDerivedPrice(PAIR, 'USD');
    console.log('[probe] current', PAIR, '/USD =', toNum1e18(curr1e18).toFixed(5));

    // try candidates with both entry points
    const candidates = [
        ...openIds.map(x => BigInt(x)),
        ...userIdxs.map(x => BigInt(x)),
    ].filter((v, i, a) => a.findIndex(z => z === v) === i);

    if (candidates.length === 0) {
        console.log('[probe] no candidates found.');
        process.exit(0);
    }

    // choose priceBound guard: long→0, short→Max
    // we need the side; take it from the first open matching candidate if possible
    let isLong = true; // default
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const pr = String(p[1]).toUpperCase();
        const open = Boolean(p[8]);
        if (!open || pr !== PAIR) continue;
        isLong = Boolean(p[2]);
        break;
    }
    const bound = isLong ? 0n : MaxUint256;

    for (const idx of candidates) {
        // A) checkTpSlAndClose
        try {
            await engine.checkTpSlAndClose.staticCall(idx);
            console.log(`[probe] checkTpSlAndClose.staticCall OK for idx=${idx}`);
        } catch (e) {
            const dec = decodeError(iface, e);
            console.log(`[probe] checkTpSlAndClose.staticCall FAIL idx=${idx}:`, dec ? dec.name : (e?.shortMessage || e?.message || 'Error'));
        }

        // B) closePosition with guard
        try {
            await engine.closePosition.staticCall(idx, bound);
            console.log(`[probe] closePosition.staticCall OK for idx=${idx} bound=${bound.toString()}`);
        } catch (e) {
            const dec = decodeError(iface, e);
            console.log(`[probe] closePosition.staticCall FAIL idx=${idx} bound=${bound.toString()}:`, dec ? dec.name : (e?.shortMessage || e?.message || 'Error'));
        }
    }
})();
