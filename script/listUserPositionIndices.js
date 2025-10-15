// script/listUserPositionIndices.js
// ESM + ethers v6, chunks logs to respect free-tier 10-block limit.

import 'dotenv/config';
import fs from 'node:fs';
import { JsonRpcProvider, Contract, Interface } from 'ethers';

const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const ENGINE = (process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS || '').trim();
const ABI_PATH = (process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json').trim();
const USER_ARG = (process.argv[2] || '').trim().toLowerCase();

// optional: lookback blocks (default 5000)
const LOOKBACK = Number(process.env.LOOKBACK_BLOCKS || 5000);
// free tier requires <=10 block spans
const CHUNK = 10;

if (!RPC || !ENGINE || !ABI_PATH || !USER_ARG) {
    console.error(
        `Usage:
  ENGINE_ABI_PATH=<path> VITE_ENGINE_ADDRESS=<engine> VITE_RPC_URL=<rpc> node script/listUserPositionIndices.js <TRADER_ADDR>

Example:
  ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \\
  VITE_ENGINE_ADDRESS=0x... \\
   VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/REDACTED\\
  node script/listUserPositionIndices.js 0xYourTrader`
    );
    process.exit(1);
}

const abiJson = JSON.parse(fs.readFileSync(ABI_PATH, 'utf8'));
const abi = abiJson.abi || abiJson;
const iface = new Interface(abi);

const provider = new JsonRpcProvider(RPC);
const contract = new Contract(ENGINE, abi, provider);

function findEventName(candidates) {
    for (const f of abi) {
        if (f.type === 'event' && candidates.includes(f.name)) return f.name;
    }
    return null;
}

function extractUserIndex(parsed) {
    const args = parsed.args || {};
    let user = (args.user || args.trader || args.owner || '').toString().toLowerCase();
    let index = args.index ?? args.positionIndex;

    if (!user || index == null) {
        // heuristic scan
        for (const v of Object.values(args)) {
            if (!user && typeof v === 'string' && v.startsWith('0x') && v.length === 42) user = v.toLowerCase();
            if (index == null) {
                const s = v?.toString?.();
                if (s && /^\d+$/.test(s)) {
                    const n = Number(s);
                    if (Number.isSafeInteger(n) && n < 1_000_000_000) index = n;
                }
            }
        }
    }
    return { user, index: index != null ? Number(index) : null };
}

async function queryLogsChunked(filterOrAll, fromBlock, toBlock) {
    const out = [];
    for (let start = fromBlock; start <= toBlock; start += CHUNK) {
        const end = Math.min(start + (CHUNK - 1), toBlock);
        try {
            // prefer queryFilter when we have a typed filter
            if (filterOrAll?.type === 'filter') {
                const logs = await contract.queryFilter(filterOrAll.filter, start, end);
                out.push(...logs);
            } else {
                // raw getLogs
                const logs = await provider.getLogs({
                    address: ENGINE,
                    fromBlock: start,
                    toBlock: end,
                    topics: filterOrAll?.topics || undefined,
                });
                out.push(...logs);
            }
        } catch (e) {
            // surface which window failed (helps if you hit any node hiccups)
            console.warn(`getLogs failed for [${start}, ${end}] → ${e?.message || e}`);
        }
    }
    return out;
}

async function main() {
    console.log('Engine:', ENGINE);
    console.log('ABI   :', ABI_PATH);
    console.log('User  :', USER_ARG);

    const openedName = findEventName(['PositionOpened', 'OpenPosition', 'Opened']);
    const closedName = findEventName(['PositionClosed', 'ClosePosition', 'Closed', 'PositionSettled']);
    if (!openedName) {
        console.error('❌ No PositionOpened-like event found in ABI.');
        process.exit(1);
    }
    console.log(`Using events: opened=${openedName} closed=${closedName || '(none found)'}`);

    const current = await provider.getBlockNumber();
    const fromBlock = Math.max(0, current - LOOKBACK);
    const toBlock = current;

    // Build typed filters if available
    const openedFilterObj = contract.filters[openedName]?.();
    const openedFilter = openedFilterObj
        ? { type: 'filter', filter: openedFilterObj }
        : { type: 'raw', topics: [iface.getEvent(openedName).topicHash] };

    const closedFilterObj = closedName ? contract.filters[closedName]?.() : null;
    const closedFilter = closedName
        ? (closedFilterObj ? { type: 'filter', filter: closedFilterObj } : { type: 'raw', topics: [iface.getEvent(closedName).topicHash] })
        : null;

    // Query chunked
    const openedLogs = await queryLogsChunked(openedFilter, fromBlock, toBlock);
    const closedLogs = closedFilter ? await queryLogsChunked(closedFilter, fromBlock, toBlock) : [];

    const opened = [];
    const closed = new Set();

    for (const lg of openedLogs) {
        let parsed;
        try { parsed = iface.parseLog(lg); } catch { continue; }
        if (parsed.name !== openedName) continue;
        const { user, index } = extractUserIndex(parsed);
        if (user === USER_ARG && index != null) opened.push({ index, blockNumber: lg.blockNumber, tx: lg.transactionHash });
    }

    for (const lg of closedLogs) {
        let parsed;
        try { parsed = iface.parseLog(lg); } catch { continue; }
        if (parsed.name !== closedName) continue;
        const { user, index } = extractUserIndex(parsed);
        if (user === USER_ARG && index != null) closed.add(index);
    }

    opened.sort((a, b) => a.blockNumber - b.blockNumber);
    const openNow = opened.filter(o => !closed.has(o.index));
    const uniq = [...new Map(openNow.map(o => [o.index, o])).values()];

    console.log(`\nScanned blocks [${fromBlock}, ${toBlock}] in ${CHUNK}-block chunks (LOOKBACK=${LOOKBACK}).`);
    if (uniq.length === 0) {
        console.log('No open indices found for user within the lookback window.');
    } else {
        console.log('Open indices for user:');
        for (const o of uniq) {
            console.log(`  • index=${o.index} (block=${o.blockNumber}) tx=${o.tx}`);
        }
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
