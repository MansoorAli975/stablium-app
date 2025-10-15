// script/closeProbe.js
// ESM, ethers v6 — tries a few priceBound variants and decodes the revert

import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Contract, Interface, MaxUint256, parseUnits } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER = process.argv[2];                 // 0x... user address (your trader)
const PAIR = process.argv[3] || 'GBP';        // e.g. "GBP"
const IDX = BigInt(process.argv[4] || '16'); // user-index (UI index)
if (!RPC || !ENGINE || !USER) {
    console.error('Usage: node script/closeProbe.js <USER> [PAIR=GBP] [USER_INDEX]');
    process.exit(1);
}

const toJSON = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ABI, provider);
    const iface = new Interface(ABI);

    // 1) Print position tuple for sanity & to see TP/SL + decimals context
    const all = await engine.getAllUserPositions(USER);
    const pos = all[Number(IDX)];
    if (!pos) {
        console.error(`No position at user-index ${IDX}. (getAllUserPositions length=${all.length})`);
        process.exit(2);
    }
    console.log(`--- Position at user-index ${IDX} ---`);
    console.log(toJSON(pos));

    // Fields we *expect* by position tuple order you printed earlier:
    // [ user, pair, isLong, entryPrice(feedUnits), marginUsedWei, leverage, tradeSizeUsd1e18, openedAt,
    //   isOpen, currentPrice(feedUnits?) or lastPrice?, realizedPnl?..., tp(feedUnits), sl(feedUnits), ???, ??? ]
    // We will not assume exact names; we’ll only use TP/SL and pair.

    // 2) Read live engine price (1e18) and convert to a few bounds to test
    const live1e18 = await engine.getDerivedPrice(PAIR, 'USD'); // 1e18
    // We don’t know what closePosition’s bound units are. We’ll try three paths:
    const bounds = [
        { label: 'zero', val: 0n },
        { label: 'maxuint', val: MaxUint256 },
        { label: 'live_1e18', val: live1e18 },           // 1e18 guess
    ];

    console.log(`live ${PAIR}/USD (1e18): ${live1e18.toString()}`);

    // 3) Try each bound with staticCall and decode any revert
    for (const b of bounds) {
        try {
            await engine.closePosition.staticCall(IDX, b.val);
            console.log(`✅ staticCall OK with bound=${b.label} (${b.val.toString()})`);
        } catch (e) {
            let decoded = null;
            try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
            if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }
            if (decoded) {
                console.log(`❌ staticCall REVERT bound=${b.label}:`, decoded.name, toJSON(decoded.args ?? []));
            } else {
                const msg = e?.shortMessage || e?.reason || e?.message || String(e);
                console.log(`❌ staticCall REVERT bound=${b.label}:`, msg);
            }
        }
    }

    // 4) Also test the keeper function once with the user-index, in case engine expects user-index here
    try {
        await engine.checkTpSlAndClose.staticCall(IDX);
        console.log(`✅ checkTpSlAndClose.staticCall OK with index=${IDX}`);
    } catch (e) {
        let decoded = null;
        try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
        if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }
        if (decoded) {
            console.log(`❌ checkTpSlAndClose.staticCall REVERT:`, decoded.name, toJSON(decoded.args ?? []));
        } else {
            const msg = e?.shortMessage || e?.reason || e?.message || String(e);
            console.log(`❌ checkTpSlAndClose.staticCall REVERT:`, msg);
        }
    }
})();
