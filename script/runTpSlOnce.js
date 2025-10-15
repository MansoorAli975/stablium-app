// script/runTpSlOnce.js
// ESM, ethers v6 — resolve user (UI) index for msg.sender and try TP/SL close at exact feed level
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Wallet, Contract, Interface, parseUnits } from 'ethers';

const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const ENGINE_ADDR = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const PK = process.env.PRIVATE_KEY; // MUST be the TRADER's key (indexes are per-msg.sender)
if (!RPC || !ENGINE_ADDR || !PK) {
    console.error('Missing RPC, ENGINE address, or PRIVATE_KEY (use the trader key).');
    console.error('Usage: node script/runTpSlOnce.js <BASE> <UI_INDEX>   e.g. node script/runTpSlOnce.js GBP 16');
    process.exit(1);
}

// Args
const arg1 = process.argv[2];
const arg2 = process.argv[3];
let BASE, UI_INDEX;
if (arg2 !== undefined) {
    BASE = String(arg1).toUpperCase();
    UI_INDEX = Number(arg2);
} else {
    BASE = 'EUR';
    UI_INDEX = Number(arg1);
}
if (!BASE || !Number.isInteger(UI_INDEX) || UI_INDEX < 0) {
    console.error('Bad arguments. Usage: node script/runTpSlOnce.js <BASE> <UI_INDEX>   e.g. GBP 16');
    process.exit(1);
}

const FEED_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

function mulDivBI(a, b, d) { return (a * b) / d; } // all BigInt

async function feeBump(provider) {
    const fd = await provider.getFeeData();
    const tip = (fd.maxPriorityFeePerGas ?? parseUnits('1', 'gwei')) + parseUnits('2', 'gwei');
    const max = (fd.maxFeePerGas ?? parseUnits('20', 'gwei')) + parseUnits('2', 'gwei');
    return { maxPriorityFeePerGas: tip, maxFeePerGas: max };
}

async function main() {
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE_ADDR, ABI, wallet);
    const iface = new Interface(ABI);
    const me = await wallet.getAddress();

    console.log('Engine   :', ENGINE_ADDR);
    console.log('RPC      :', RPC);
    console.log('Caller   :', me);
    console.log('BASE     :', BASE);
    console.log('UI Index :', UI_INDEX);

    // 1) Fetch user's positions; verify tuple & OPEN state at UI index
    const all = await engine.getAllUserPositions(me);
    if (UI_INDEX >= all.length) {
        console.error(`UI index ${UI_INDEX} out of range (user has ${all.length} positions).`);
        process.exit(1);
    }

    const pos = all[UI_INDEX];
    const pair = String(pos[1]);
    const isLong = Boolean(pos[2]);
    const entryFeed = BigInt(pos[3]);      // feed units (bigint)
    const isOpen = Boolean(pos[8]);
    const tpFeed = BigInt(pos[12] ?? 0n);
    const slFeed = BigInt(pos[13] ?? 0n);

    if (pair !== BASE) {
        console.error(`UI index ${UI_INDEX} is ${pair}, not ${BASE}. Pick the correct row.`);
        process.exit(1);
    }
    if (!isOpen) {
        console.error(`UI index ${UI_INDEX} (${BASE}) is already closed.`);
        process.exit(1);
    }

    console.log('Tuple @UI index =>', {
        pair, isLong,
        entryFeed: entryFeed.toString(),
        tpFeed: tpFeed.toString(),
        slFeed: slFeed.toString(),
    });

    // 2) Confirm this UI index is currently open according to engine
    const openIds = await engine.getOpenPositionIds(me, BASE);
    console.log('Engine-reported open UI indices for user+base:', openIds.map(String));
    if (!openIds.map(Number).includes(UI_INDEX)) {
        console.error(`UI index ${UI_INDEX} is not in getOpenPositionIds(${me}, ${BASE}).`);
        process.exit(1);
    }

    // 3) Read live price and feed decimals; convert EXACTLY to feed units via BigInt math
    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    if (!feedAddr) {
        console.error(`No feed configured for ${BASE}`);
        process.exit(1);
    }
    const feed = new Contract(feedAddr, FEED_ABI, provider);

    // IMPORTANT: ensure decimals is a JS Number for human formatting
    const dec = Number(await feed.decimals());  // <-- fix: cast to Number
    const scale = 10n ** BigInt(dec);

    const now1e18 = BigInt(await engine.getDerivedPrice(BASE, 'USD')); // 1e18 bigint
    const nowFeed = mulDivBI(now1e18, scale, 10n ** 18n);              // integer feed units

    const [, , , updatedAt] = await feed.latestRoundData();
    const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt));

    const human = (n, d = 8) => {
        const s = n.toString();
        if (d === 0) return s;
        const need = d - s.length;
        const padded = need >= 0 ? ('0'.repeat(need + 1) + s) : s;
        const i = padded.length - d;
        return padded.slice(0, i) + '.' + padded.slice(i);
    };

    console.log(`Live ${BASE}/USD (feed units): ${nowFeed.toString()}  (~${human(nowFeed, dec)}) age=${ageSec}s`);
    console.log(`TP(feed)=${tpFeed.toString()}  SL(feed)=${slFeed.toString()}`);

    // 4) Local check; engine appears to require EXACT equality at trigger
    let locallyAtTrigger = false;
    if (tpFeed > 0n) locallyAtTrigger ||= (nowFeed === tpFeed);
    if (slFeed > 0n) locallyAtTrigger ||= (nowFeed === slFeed);
    if (!locallyAtTrigger) {
        console.log('ℹ️  Locally not at exact TP/SL. Engine likely requires equality; continuing to static check.');
    }

    // 5) Dry-run engine (must use UI index with trader key)
    try {
        await engine.checkTpSlAndClose.staticCall(UI_INDEX);
        console.log('✅ Static call says: TRIGGERABLE now. Sending tx…');
    } catch (e) {
        let decoded = null;
        try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
        if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }

        if (decoded) {
            console.error('ℹ️  Static call reverted:', decoded.name, decoded.args ?? []);
        } else {
            console.error('ℹ️  Static call reverted:', e.shortMessage || e.message || e);
        }
        console.error('Hint: push the feed to the EXACT TP/SL (8 dp) then re-run immediately with the trader key.');
        process.exit(0);
    }

    // 6) Send tx
    try {
        const fees = await feeBump(provider);
        const tx = await engine.checkTpSlAndClose(UI_INDEX, fees);
        console.log('⏳ TX sent:', tx.hash);
        const rcpt = await tx.wait();
        console.log('✅ Mined in block', rcpt.blockNumber, 'status', rcpt.status);
    } catch (e) {
        let decoded = null;
        try { decoded = iface.parseError(e?.data || e?.error?.data || e); } catch { }
        if (!decoded && e?.data?.data) { try { decoded = iface.parseError(e.data.data); } catch { } }
        if (decoded) {
            console.error(`❌ Send failed: ${decoded.name}`, decoded.args ?? []);
        } else {
            console.error('❌ Send failed:', e.shortMessage || e.message || e);
        }
        process.exit(1);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
