// Usage:
// ENGINE_ABI_PATH=out/ForexEngine.sol/ForexEngine.json \
// VITE_ENGINE_ADDRESS=0x... \
// VITE_RPC_URL="https://..." \
// LOOKBACK_BLOCKS=20000 \
// node script/listUserPositionIndices_progress.js 0xYourUser

import 'dotenv/config';
import { JsonRpcProvider, Interface, id, getAddress, zeroPadValue } from 'ethers';
import fs from 'fs';
import path from 'path';

const argvUser = process.argv[2];
if (!argvUser) {
    console.error('Usage: node script/listUserPositionIndices_progress.js <userAddress>');
    process.exit(1);
}

const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const LOOKBACK = Number(process.env.LOOKBACK_BLOCKS || 20000);

// IMPORTANT: Alchemy free tier allows **at most 10 blocks** per getLogs.
// Since `fromBlock` and `toBlock` are inclusive, the span must be <= 9 difference.
const CHUNK = 10;              // desired size
const SPAN = CHUNK - 1;       // inclusive span (max 9)
const PROGRESS_EVERY = 100;    // print progress every N chunks

function loadAbi(abiPath) {
    const raw = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
    return Array.isArray(raw) ? raw : raw.abi;
}

async function* fetchLogsInRange(provider, address, start, end, topics) {
    let chunkCount = 0;
    for (let a = start; a <= end; a += CHUNK) {
        // enforce inclusive span <= 9
        const b = Math.min(end, a + SPAN);
        try {
            const logs = await provider.getLogs({ address, fromBlock: a, toBlock: b, topics });
            yield logs;
        } catch (e) {
            console.error(`getLogs failed for [${a}, ${b}] → ${e?.shortMessage || e?.message || e}`);
        } finally {
            chunkCount++;
            if (chunkCount % PROGRESS_EVERY === 0) {
                const done = Math.min(end, start + chunkCount * CHUNK - 1);
                const pct = (((done - start) / Math.max(1, end - start)) * 100).toFixed(1);
                console.log(`…progress: ${chunkCount} chunks, blocks ${done}/${end} (${pct}%)`);
            }
        }
    }
}

async function main() {
    if (!ENGINE || !RPC) {
        console.error('Missing VITE_ENGINE_ADDRESS/ENGINE_ADDRESS or VITE_RPC_URL/SEPOLIA_RPC_URL');
        process.exit(1);
    }

    const user = getAddress(argvUser); // checksum
    const provider = new JsonRpcProvider(RPC);
    const abi = loadAbi(ABI_PATH);
    const iface = new Interface(abi);

    console.log('Engine:', ENGINE);
    console.log('ABI   :', path.resolve(ABI_PATH));
    console.log('User  :', user);
    console.log('Using events: opened=PositionOpened closed=PositionClosed\n');

    // Topics
    const topicOpened = id('PositionOpened(address,uint256,bytes32,bool,uint256,uint256,uint256)');
    const topicClosed = id('PositionClosed(address,uint256,int256)');
    const topicUser = zeroPadValue(user, 32); // indexed address topic

    const latest = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latest - LOOKBACK);
    const toBlock = latest;

    const openByIndex = new Map();
    const openTxByIdx = new Map();
    const closedByIndex = new Map();

    // Pull PositionOpened for this user
    for await (const logs of fetchLogsInRange(provider, ENGINE, fromBlock, toBlock, [topicOpened, topicUser])) {
        for (const log of logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name !== 'PositionOpened') continue;
                const [u, index] = parsed.args;
                if (getAddress(u) !== user) continue;
                const idx = Number(index);
                openByIndex.set(idx, true);
                openTxByIdx.set(idx, log.transactionHash);
            } catch { }
        }
    }

    // Pull PositionClosed for this user
    for await (const logs of fetchLogsInRange(provider, ENGINE, fromBlock, toBlock, [topicClosed, topicUser])) {
        for (const log of logs) {
            try {
                const parsed = iface.parseLog(log);
                if (parsed?.name !== 'PositionClosed') continue;
                const [u, index] = parsed.args;
                if (getAddress(u) !== user) continue;
                const idx = Number(index);
                closedByIndex.set(idx, true);
            } catch { }
        }
    }

    const openIndices = [...openByIndex.keys()]
        .filter((idx) => !closedByIndex.get(idx))
        .sort((a, b) => a - b);

    console.log('\n=== Scan Summary ===');
    console.log(`Range      : [${fromBlock}, ${toBlock}] (≈ ${LOOKBACK} blocks)`);
    console.log(`Open idx   : ${openIndices.length ? openIndices.join(', ') : '(none found in range)'}`);
    if (openIndices.length) {
        console.log('\nDetails:');
        for (const idx of openIndices) {
            const tx = openTxByIdx.get(idx);
            console.log(`  • index=${idx}${tx ? `  openedTx=${tx}` : ''}`);
        }
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
