// script/runTpSlForUser.js
// ESM, ethers v6 — trigger TP/SL for *your* per-user index (must call from the trader wallet!)
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract, Interface, formatUnits } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

// IMPORTANT: this must be the TRADER's key (Account 6)
const PK = process.env.PRIVATE_KEY;

const uiIndexArg = process.argv[2]; // e.g. 16
if (!RPC || !ENGINE || !PK || !uiIndexArg) {
    console.error('Usage: node script/runTpSlForUser.js <USER_INDEX>');
    console.error('Env needed: ENGINE_ABI_PATH, VITE_ENGINE_ADDRESS, VITE_RPC_URL (or SEPOLIA_RPC_URL), PRIVATE_KEY (TRADER)');
    process.exit(1);
}
const UI_INDEX = BigInt(uiIndexArg);

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

const toNum1e18 = (x) => Number(formatUnits(x ?? 0n, 18));

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE, ABI, wallet);
    const iface = new Interface(ABI);

    console.log('engine :', ENGINE);
    console.log('caller :', await wallet.getAddress());
    console.log('uiIdx  :', UI_INDEX.toString());

    // fetch your positions and sanity-print the selected one
    const user = await wallet.getAddress();
    const all = await engine.getAllUserPositions(user);
    const has = Number(UI_INDEX) < all.length;
    if (!has) {
        console.error(`No position at user index ${UI_INDEX} (array length=${all.length}).`);
        process.exit(1);
    }

    const pos = all[Number(UI_INDEX)];
    // tuple layout (based on your dumps):
    // [0] user, [1] pair, [2] isLong, [3] entryFeed, [4] marginWeth, [5] leverage,
    // [6] tradeSizeUsd1e18, [7] openedAt, [8] isOpen,
    // [9] realized?, [10] pnl?, [11] closeTs?,
    // [12] takeProfitFeed, [13] stopLossFeed, [14] ??? (ignore), [15] liqPrice1e18 (ignore)
    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const open = Boolean(pos[8]);
    const tpFeed = BigInt(pos[12] ?? 0n);
    const slFeed = BigInt(pos[13] ?? 0n);

    if (!open) {
        console.log('This position is already closed.');
        process.exit(0);
    }

    // current on-chain price 1e18 → number
    const curr1e18 = await engine.getDerivedPrice(pair, 'USD');
    const currNum = toNum1e18(curr1e18);

    // read feed + decimals just to print human versions of tp/sl
    const feedAddr = await engine.getSyntheticPriceFeed(pair);
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const dec = Number(await feed.decimals());
    const scale = 10n ** BigInt(dec);
    const tpNum = tpFeed > 0n ? Number(tpFeed) / Number(scale) : 0;
    const slNum = slFeed > 0n ? Number(slFeed) / Number(scale) : 0;

    console.log(`pair  : ${pair}`);
    console.log(`side  : ${isLong ? 'LONG' : 'SHORT'}`);
    console.log(`curr  : ${currNum.toFixed(5)}`);
    console.log(`TP    : ${tpFeed > 0n ? tpNum.toFixed(dec) : '(none)'}`);
    console.log(`SL    : ${slFeed > 0n ? slNum.toFixed(dec) : '(none)'}`);

    // 1) STATIC probe — must be called from *user* wallet; index is per-user index
    try {
        await engine.checkTpSlAndClose.staticCall(UI_INDEX);
        console.log('✅ Static OK: triggerable right now.');
    } catch (e) {
        let reason = 'unknown';
        try {
            const parsed = iface.parseError(e?.data || e?.error?.data || e);
            reason = parsed?.name || reason;
        } catch { }
        console.log('ℹ️  Static reverted (not triggerable yet):', reason);
        process.exit(0);
    }

    // 2) SEND tx
    try {
        const tx = await engine.checkTpSlAndClose(UI_INDEX);
        console.log('⏳ sent:', tx.hash);
        const rc = await tx.wait();
        console.log('✅ mined block', rc.blockNumber, 'status', rc.status);
    } catch (e) {
        let detail = e?.message || String(e);
        try {
            const parsed = iface.parseError(e?.data || e?.error?.data || e);
            if (parsed?.name) detail = parsed.name;
        } catch { }
        console.error('❌ send failed:', detail);
        process.exit(1);
    }
})();
