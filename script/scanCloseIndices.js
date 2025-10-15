// script/scanCloseIndices.js
// ESM, ethers v6 — brute-force which user-index works with closePosition()
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract, MaxUint256, Interface } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER_PK = process.env.PRIVATE_KEY;
const USER_ADDR = process.env.USER_ADDRESS || process.argv[2] || '';
const PAIR = (process.env.PAIR || process.argv[3] || 'GBP').toUpperCase();  // EUR/GBP/JPY

if (!RPC || !ENGINE || !USER_PK || !USER_ADDR) {
    console.error('Usage: USER_ADDRESS=0x.. [PAIR=GBP] node script/scanCloseIndices.js [USER_ADDRESS] [PAIR]');
    console.error('Missing RPC / ENGINE / PRIVATE_KEY / USER_ADDRESS.');
    process.exit(1);
}

function toNum1e18(x) { try { return Number(x) / 1e18; } catch { return NaN; } }
function decodeError(iface, e) { try { return iface.parseError(e?.data || e?.error?.data || e); } catch { return null; } }

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(USER_PK, provider);
    const engine = new Contract(ENGINE, ABI, wallet);
    const iface = new Interface(ABI);

    console.log('[scan] engine  :', ENGINE);
    console.log('[scan] user    :', USER_ADDR);
    console.log('[scan] pair    :', PAIR);
    console.log('[scan] caller  :', await wallet.getAddress());

    // pull all user positions (local user-array indices are 0..list.length-1)
    const list = await engine.getAllUserPositions(USER_ADDR);
    console.log('[scan] total positions returned:', list.length);

    // current price (just for context)
    const curr1e18 = await engine.getDerivedPrice(PAIR, 'USD').catch(() => 0n);
    if (curr1e18) console.log(`[scan] current ${PAIR}/USD =`, toNum1e18(curr1e18).toFixed(5));

    // For each user-array index, if it's open & pair matches, try closePosition.staticCall
    let found = [];
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const pr = String(p[1]).toUpperCase();
        const isOpen = Boolean(p[8]);

        if (!isOpen || pr !== PAIR) continue;

        const isLong = Boolean(p[2]);
        // guard: long -> 0, short -> Max
        const guard = isLong ? 0n : MaxUint256;

        try {
            await engine.closePosition.staticCall(i, guard);
            console.log(`[scan] closePosition.staticCall OK  userIndex=${i}  guard=${isLong ? '0' : 'Max'}`);
            found.push(i);
        } catch (e) {
            const dec = decodeError(iface, e);
            const msg = dec ? dec.name : (e?.shortMessage || e?.message || 'Error');
            // Only print succinctly to avoid spam
            console.log(`[scan] closePosition.staticCall FAIL userIndex=${i} (${pr}, open=${isOpen}, long=${isLong}) -> ${msg}`);
        }
    }

    if (found.length === 0) {
        console.log('[scan] No user-index passed closePosition.staticCall().');
    } else {
        console.log('[scan] Candidates that passed closePosition.staticCall():', found);
    }
})();
