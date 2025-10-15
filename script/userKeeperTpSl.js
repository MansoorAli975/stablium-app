// script/userKeeperTpSl.js
// ESM, ethers v6 — user-focused TP/SL keeper with correct close guard fallback
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    JsonRpcProvider, Wallet, Contract, Interface,
    MaxUint256, parseUnits
} from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;
const USER = process.env.USER_ADDRESS;
const LOOP_MS = Number(process.env.LOOP_MS || '15000');

if (!ENGINE || !RPC || !PK || !USER) {
    console.error('Missing ENGINE, RPC, PRIVATE_KEY and/or USER_ADDRESS.');
    process.exit(1);
}

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

function to1e18(feedValueBI, decimals) {
    const d = Number(decimals);
    if (d === 18) return feedValueBI;
    if (d < 18) return feedValueBI * 10n ** BigInt(18 - d);
    return feedValueBI / 10n ** BigInt(d - 18);
}

function fmt(x, dp = 8) {
    if (typeof x === 'bigint') {
        // assume feed units with 8dp for logging
        const s = x.toString().padStart(9, '0');
        const head = s.slice(0, -8) || '0';
        const tail = s.slice(-8);
        return `${head}.${tail}`.replace(/^(-?)\./, '$10.');
    }
    if (typeof x === 'number') return x.toFixed(dp);
    return String(x);
}

async function main() {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE, abi, wallet);

    console.log('[keeper] RPC    :', RPC);
    console.log('[keeper] Engine :', ENGINE);
    console.log('[keeper] Caller :', await wallet.getAddress());
    console.log('[keeper] Watch  :', USER);
    console.log('[keeper] ABI    :', abs);

    // helper to fetch decimals + price feed address for a base (synthetic)
    async function getFeed(base) {
        const feedAddr = await engine.getSyntheticPriceFeed(base);
        // decimals() on aggregator
        const FEED_ABI = ['function decimals() view returns (uint8)', 'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)'];
        const feed = new Contract(feedAddr, FEED_ABI, provider);
        const dec = Number(await feed.decimals());
        const [, answer] = await feed.latestRoundData();
        return { feedAddr, dec, lastAnswer: BigInt(answer) };
    }

    async function loop() {
        try {
            // For each pair that user has open positions on, we need to sweep those UI indices.
            // We don’t know the bases upfront; iterate over a small set you trade. Here we
            // only care about GBP (your current case). Add more if needed.
            const baseList = ['GBP']; // extend if you want: ['EUR','GBP','JPY']

            for (const base of baseList) {
                // Engine-native helper gives us the UI (per-user) indices for that pair
                const uiIdxArr = await engine.getOpenPositionIds(USER, base); // returns uint256[]
                if (!uiIdxArr || uiIdxArr.length === 0) continue;

                // feed info and live price
                const { dec, lastAnswer } = await getFeed(base);
                const nowFeed = lastAnswer; // already feed units
                const nowHuman = fmt(nowFeed);

                for (const uiIdx of uiIdxArr) {
                    // pull full position list and slice the UI index tuple
                    const all = await engine.getAllUserPositions(USER);
                    const pos = all[Number(uiIdx)];
                    if (!pos) continue;

                    // tuple layout (based on your dumps):
                    // [user, pair, isLong, entryFeed, marginWei, leverage, size1e18, tsOpen,
                    //  isOpen, .., .., .., tpFeed, slFeed, id_like, something]
                    const isLong = Boolean(pos[2]);
                    const isOpen = Boolean(pos[8]);
                    const tpFeed = BigInt(pos[12] || 0);
                    const slFeed = BigInt(pos[13] || 0);

                    if (!isOpen) continue;

                    const crossed =
                        (isLong && tpFeed > 0n && nowFeed >= tpFeed) ||
                        (!isLong && slFeed > 0n && nowFeed <= slFeed);

                    console.log(`[keeper] check ${base} ui=${uiIdx} long=${isLong} now=${fmt(nowFeed)} tp=${fmt(tpFeed)} sl=${fmt(slFeed)} crossed=${crossed}`);

                    if (!crossed) continue;

                    // 1) Try the engine’s TP/SL path first
                    try {
                        await engine.checkTpSlAndClose.staticCall(uiIdx);
                        console.log(`[keeper] keeper.static OK ui=${uiIdx} — sending…`);
                        const tx = await engine.checkTpSlAndClose(uiIdx);
                        console.log(`[keeper] keeper.tx sent ui=${uiIdx} => ${tx.hash}`);
                        const rcpt = await tx.wait();
                        console.log(`[keeper] keeper.tx confirmed block=${rcpt.blockNumber}`);
                        continue; // done
                    } catch (e) {
                        let reason = 'Error';
                        try {
                            const parsed = iface.parseError(e?.data || e?.error?.data || e);
                            reason = parsed?.name || reason;
                        } catch { }
                        console.log(`[keeper] keeper.static failed ui=${uiIdx}: ${reason}`);
                    }

                    // 2) Fallback: closePosition with a **correct guard**
                    //    - LONG  -> guard = MaxUint256 (accept any price up to guard)
                    //    - SHORT -> guard = 0
                    const guard = isLong ? MaxUint256 : 0n;

                    // safety: simulate before sending
                    try {
                        await engine.closePosition.staticCall(uiIdx, guard);
                    } catch (e) {
                        let reason = 'Error';
                        try {
                            const parsed = iface.parseError(e?.data || e?.error?.data || e);
                            reason = parsed?.name || reason;
                        } catch {
                            // plain Error(string)?
                            if (e?.reason) reason = e.reason;
                        }
                        console.log(`[keeper] close.static failed ui=${uiIdx} guard=${isLong ? 'MaxUint256' : '0'}: ${reason}`);
                        // nothing else we can do for this index now
                        continue;
                    }

                    try {
                        const tx = await engine.closePosition(uiIdx, guard);
                        console.log(`[keeper] close.tx sent ui=${uiIdx} guard=${isLong ? 'MaxUint256' : '0'} => ${tx.hash}`);
                        const rcpt = await tx.wait();
                        console.log(`[keeper] close.tx confirmed block=${rcpt.blockNumber}`);
                    } catch (e) {
                        let reason = 'Error';
                        try {
                            const parsed = iface.parseError(e?.data || e?.error?.data || e);
                            reason = parsed?.name || reason;
                        } catch {
                            if (e?.reason) reason = e.reason;
                        }
                        console.log(`[keeper] close.send failed ui=${uiIdx}: ${reason}`);
                    }
                }
            }
        } catch (e) {
            console.log('[keeper] loop error:', e.shortMessage || e.message || e);
        } finally {
            setTimeout(loop, LOOP_MS);
        }
    }

    await loop();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
