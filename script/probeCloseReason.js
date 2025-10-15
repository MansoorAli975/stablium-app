// script/probeCloseReason.js
// Single-shot diagnosis for one (BASE, UI index).
// Tries closePosition and checkTpSlAndClose; prints deep revert info.

import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    JsonRpcProvider, Wallet, Contract, Interface,
    MaxUint256, formatUnits
} from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.PRIVATE_KEY;
const USER = process.env.USER_ADDRESS || '';
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

const BASE = (process.argv[2] || '').toUpperCase(); // e.g. GBP
const UI = BigInt(process.argv[3] || '0');

if (!ENGINE || !RPC || !PK || !BASE) {
    console.error('Usage: VITE_ENGINE_ADDRESS RPC PRIVATE_KEY set in env; node script/probeCloseReason.js <BASE> <UI_INDEX>');
    process.exit(1);
}

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];
const ONEe18 = 10n ** 18n;

function toFeedUnits(p1e18, d) { return (p1e18 * 10n ** BigInt(d)) / ONEe18; }
function mulDiv(a, b, c) { return (BigInt(a) * BigInt(b)) / BigInt(c); }
function human1e18(x) { try { return Number(formatUnits(x, 18)).toFixed(8); } catch { return String(x); } }

function digHex(e) {
    const cands = [e?.data, e?.error?.data, e?.info?.error?.data, e?.transaction?.data, e?.receipt?.revertReason];
    for (const c of cands) { if (typeof c === 'string' && c.startsWith('0x') && c.length >= 10) return c; }
    return null;
}
function diagError(e, iface) {
    const hex = digHex(e);
    let name = ''; try { if (hex) name = iface.parseError(hex)?.name || ''; } catch { }
    const selector = hex ? hex.slice(0, 10) : '';
    const summary = name ? `(${name})` : (selector ? `selector=${selector}` : (e?.shortMessage || e?.message || 'Error'));
    const raw = { code: e?.code, shortMessage: e?.shortMessage, message: e?.message, reason: e?.reason, data: e?.data, errorData: e?.error?.data, info: e?.info };
    return { summary, raw };
}

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const j = JSON.parse(raw);
    if (!j.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: j.abi, abs };
}

(async () => {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE, abi, wallet);

    console.log('[probe] engine:', ENGINE);
    console.log('[probe] base  :', BASE);
    console.log('[probe] uiIdx :', UI.toString());
    console.log('[probe] ABI   :', abs);

    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    const feed = new Contract(feedAddr, FEED_ABI, provider);
    const d = Number(await feed.decimals());

    const now1e18 = await engine.getDerivedPrice(BASE, 'USD');
    const nowFeed = toFeedUnits(now1e18, d);
    console.log('[probe] live', BASE, '/USD =', Number(formatUnits(nowFeed, d)).toFixed(d));

    const all = await engine.getAllUserPositions(await wallet.getAddress());
    const t = all[Number(UI)];
    if (!t) { console.log('[probe] tuple not found at this UI index'); process.exit(1); }

    const isLong = Boolean(t[2]);
    const tpFeed = BigInt(t[12] || 0n);
    const slFeed = BigInt(t[13] || 0n);
    console.log('[probe] tuple: isLong=', isLong, 'tpFeed=', tpFeed.toString(), 'slFeed=', slFeed.toString());

    // realistic bound (5% window around NOW)
    const span = mulDiv(now1e18, 500n, 10000n);
    const bound = isLong ? (now1e18 - span) : (now1e18 + span);
    const hard = isLong ? MaxUint256 : 0n;

    // A) closePosition
    console.log('\n[probe] closePosition.staticCall (window bound) …');
    try {
        await engine.closePosition.staticCall(UI, bound);
        console.log('[probe] closePosition.staticCall PASSED (window).');
    } catch (e) {
        const d1 = diagError(e, iface);
        console.log('[probe] closePosition.staticCall REVERT (window):', d1.summary);
        console.dir(d1.raw, { depth: 4 });
    }

    console.log('[probe] closePosition.staticCall (hard guard) …');
    try {
        await engine.closePosition.staticCall(UI, hard);
        console.log('[probe] closePosition.staticCall PASSED (hard).');
    } catch (e) {
        const d2 = diagError(e, iface);
        console.log('[probe] closePosition.staticCall REVERT (hard):', d2.summary);
        console.dir(d2.raw, { depth: 4 });
    }

    // B) checkTpSlAndClose
    console.log('\n[probe] checkTpSlAndClose.staticCall …');
    try {
        await engine.checkTpSlAndClose.staticCall(UI);
        console.log('[probe] checkTpSlAndClose.staticCall PASSED.');
    } catch (e) {
        const d3 = diagError(e, iface);
        console.log('[probe] checkTpSlAndClose.staticCall REVERT:', d3.summary);
        console.dir(d3.raw, { depth: 4 });
    }
})();
