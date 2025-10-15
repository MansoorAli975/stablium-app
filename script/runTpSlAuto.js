// script/runTpSlAuto.js  (ESM, ethers v6)
// Usage: node script/runTpSlAuto.js <BASE> <uiIndex>
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    JsonRpcProvider, Wallet, Contract, Interface
} from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE_ADDR = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const PK = process.env.PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY || process.env.ORACLE_PRIVATE_KEY;

const BASE = (process.argv[2] || '').toUpperCase();
const UI_INDEX = BigInt(process.argv[3] || '0');

if (!ENGINE_ADDR || !RPC || !PK || !BASE) {
    console.error('Usage: node script/runTpSlAuto.js <BASE> <uiIndex>');
    console.error('Missing ENGINE/VITE_ENGINE_ADDRESS, RPC, or PRIVATE_KEY.');
    process.exit(1);
}

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

const FEED_RO_ABI = [
    'function decimals() view returns (uint8)',
    'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
];

async function main() {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);
    const provider = new JsonRpcProvider(RPC);
    const wallet = new Wallet(PK, provider);
    const engine = new Contract(ENGINE_ADDR, abi, wallet);

    console.log('Engine :', ENGINE_ADDR);
    console.log('RPC    :', RPC);
    console.log('Caller :', await wallet.getAddress());
    console.log('BASE   :', BASE);
    console.log('UI idx :', UI_INDEX.toString());
    console.log('ABI    :', abs);

    // Print live price quick (helps sanity check freshness)
    const feedAddr = await engine.getSyntheticPriceFeed(BASE);
    if (feedAddr && feedAddr !== '0x0000000000000000000000000000000000000000') {
        const feed = new Contract(feedAddr, FEED_RO_ABI, provider);
        try {
            const dec = Number(await feed.decimals());
            const [, answer, , updatedAt] = await feed.latestRoundData();
            const age = Math.max(0, Math.floor(Date.now() / 1000) - Number(updatedAt));
            const human = Number(answer) / 10 ** dec;
            console.log(`Live ${BASE}/USD feed: ${human} (age=${age}s) @ ${feedAddr}`);
        } catch { }
    }

    // Show tuple at UI index if available
    try {
        const tuple = await engine.getUserPositionTuple(await wallet.getAddress(), BASE, UI_INDEX);
        // attempt generic field names
        const simple = {
            pair: tuple[1],
            isLong: Boolean(tuple[2]),
            isOpen: Boolean(tuple[8]),
            entryFeed: String(tuple[3]),
            tpFeed: String(tuple[12]),
            slFeed: String(tuple[13]),
            idLike: String(tuple[14] ?? 0n),
        };
        console.log('Tuple @UI index =>', simple);
    } catch {
        console.log('Tuple view getUserPositionTuple(...) not found or failed (ok).');
    }

    // Build candidate signatures for keeper
    const candidates = [];
    for (const f of iface.fragments) {
        if (f.type !== 'function') continue;
        if ((f.name || '').toLowerCase().includes('check') &&
            (f.name || '').toLowerCase().includes('close')) {
            const ins = (f.inputs || []).map(i => i.type);
            if (ins.join(',') === 'uint256') {
                candidates.push({ name: f.name, args: ['uint256'] });
            } else if (ins.join(',') === 'address,uint256') {
                candidates.push({ name: f.name, args: ['address', 'uint256'] });
            } else if (ins.join(',') === 'address,string,uint256') {
                candidates.push({ name: f.name, args: ['address', 'string', 'uint256'] });
            }
        }
    }

    if (!candidates.length) {
        console.log('No keeper-like function found (name contains both "check" and "close").');
        console.log('Use script/printKeeperSigs.js to list all and tell me what shows up.');
        process.exit(1);
    }

    console.log('\nKeeper candidates:', candidates.map(c => `${c.name}(${c.args.join(',')})`).join(' | '));
    const user = await wallet.getAddress();

    // Try both potential index spaces: UI index itself, and any "id-like" discovered from tuple slot14 if present
    const idxCandidates = [UI_INDEX];
    // probe a few UI->id helpers if ABI exposes them
    try {
        const id = await engine.userIndexToGlobalId(user, BASE, UI_INDEX);
        if (typeof id === 'bigint' && id !== UI_INDEX) idxCandidates.push(id);
    } catch { }
    try {
        const id2 = await engine.getGlobalIdFromUserIndex(user, BASE, UI_INDEX);
        if (typeof id2 === 'bigint' && !idxCandidates.includes(id2)) idxCandidates.push(id2);
    } catch { }

    // Also try reading tuple slot 14 if getUserPositionTuple returns it
    try {
        const t = await engine.getUserPositionTuple(user, BASE, UI_INDEX);
        const maybe = BigInt(t[14] || 0);
        if (maybe && !idxCandidates.includes(maybe)) idxCandidates.push(maybe);
    } catch { }

    console.log('Index candidates to try:', idxCandidates.map(x => x.toString()));

    // helper to run static
    async function tryStatic(fnName, argKinds, idx) {
        try {
            let args;
            if (argKinds.length === 1) { // [uint256]
                args = [idx];
            } else if (argKinds.length === 2) { // [address,uint256]
                args = [user, idx];
            } else { // [address,string,uint256]
                args = [user, BASE, idx];
            }
            await engine[fnName].staticCall(...args);
            return { ok: true, args };
        } catch (e) {
            const msg = e?.reason || e?.shortMessage || e?.message || String(e);
            return { ok: false, err: msg };
        }
    }

    // Try all combos until one staticCall passes
    let chosen = null;
    for (const c of candidates) {
        for (const idx of idxCandidates) {
            const res = await tryStatic(c.name, c.args, idx);
            const label = `${c.name}(${c.args.join(',')}) idx=${idx}`;
            if (res.ok) {
                console.log(`✅ static OK: ${label}`);
                chosen = { fn: c.name, args: res.args, label };
                break;
            } else {
                console.log(`ℹ️  static REVERT: ${label} -> ${res.err}`);
            }
        }
        if (chosen) break;
    }

    if (!chosen) {
        console.log('\nNo keeper signature accepted a static call. This usually means either:\n' +
            '• price not at trigger under engine rules (try exact TP and TP+buffer freshly), or\n' +
            '• the function expects a different index space. Send me the output of printKeeperSigs.js.\n');
        process.exit(0);
    }

    // Send tx
    try {
        const tx = await engine[chosen.fn](...chosen.args);
        console.log('⏳ TX sent:', tx.hash, 'via', chosen.label);
        const rcpt = await tx.wait();
        console.log('✅ Mined in block', rcpt.blockNumber, 'status', rcpt.status);
    } catch (e) {
        console.error('❌ Send failed:', e?.reason || e?.shortMessage || e?.message || e);
        process.exit(1);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
