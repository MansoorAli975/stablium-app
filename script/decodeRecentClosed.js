// script/decodeRecentClosed.js
// ESM, ethers v6 — scan recent blocks for PositionClosed(user) using 10-block chunks
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Interface, getAddress } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER = process.argv[2];                    // e.g. 0x156F...Ad76
const LOOK = Number(process.argv[3] || '2500');  // blocks to scan back

if (!RPC || !ENGINE || !USER) {
    console.error('Usage: node script/decodeRecentClosed.js <USER_ADDRESS> [LOOKBACK_BLOCKS=2500]');
    process.exit(1);
}

const iface = new Interface(ABI);

// helper: pretty-print named args without numeric indexes
function prettyArgs(args) {
    const out = {};
    if (args && typeof args === 'object') {
        for (const [k, v] of Object.entries(args)) {
            if (String(Number(k)) === k) continue; // skip numeric keys
            out[k] = typeof v === 'bigint' ? v.toString() : v;
        }
    }
    return out;
}

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const latest = await provider.getBlockNumber();
    const start = Math.max(0, latest - LOOK);

    const userLower = getAddress(USER).toLowerCase();

    const matches = [];
    const CHUNK = 10; // Alchemy free tier requires <= 10 block window

    console.log(`[scan] engine=${ENGINE}`);
    console.log(`[scan] user  =${USER}`);
    console.log(`[scan] range =${start}..${latest} (lookback=${LOOK})`);
    console.log(`[scan] chunk =${CHUNK} blocks (Alchemy free-tier safe)\n`);

    for (let from = start; from <= latest; from += CHUNK) {
        const to = Math.min(latest, from + CHUNK - 1);

        try {
            const logs = await provider.getLogs({
                address: ENGINE,
                fromBlock: from,
                toBlock: to,
            });

            for (const log of logs) {
                let parsed = null;
                try {
                    parsed = iface.parseLog({ topics: log.topics, data: log.data });
                } catch {
                    continue; // not an engine ABI event
                }
                if (!parsed || parsed.name !== 'PositionClosed') continue;

                // check if USER is present (decoded or indexed topic)
                let involvesUser = false;

                // A) decoded args (any address field equal to USER)
                for (const v of Object.values(parsed.args)) {
                    if (typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v)) {
                        if (getAddress(v).toLowerCase() === userLower) {
                            involvesUser = true;
                            break;
                        }
                    }
                }
                // B) fallback: topics (skip topic[0], check indexed args)
                if (!involvesUser) {
                    for (const t of log.topics.slice(1)) {
                        if (t.toLowerCase().endsWith(userLower.slice(2))) {
                            involvesUser = true;
                            break;
                        }
                    }
                }

                if (involvesUser) {
                    matches.push({
                        blockNumber: log.blockNumber,
                        txHash: log.transactionHash,
                        parsed,
                    });
                }
            }
        } catch (e) {
            // If Alchemy throttles, show hint and stop
            console.error(`[scan] getLogs failed for ${from}..${to}:`, e.shortMessage || e.message || e);
            console.error('Hint: If this persists, reduce LOOKBACK_BLOCKS or wait a bit.');
            process.exit(2);
        }

        // light pacing to be polite to the node
        await new Promise(r => setTimeout(r, 120));
    }

    if (matches.length === 0) {
        console.log(`No PositionClosed for ${USER} in last ${LOOK} blocks.`);
        process.exit(0);
    }

    // newest first
    matches.sort((a, b) => b.blockNumber - a.blockNumber);
    const newest = matches[0];

    console.log('\n--- Newest PositionClosed for user ---');
    console.log('block:', newest.blockNumber);
    console.log('tx   :', newest.txHash);

    const frag = iface.getEvent('PositionClosed'); // v6 OK
    console.log('\nEvent signature:', frag.format());
    console.log('\nInputs:');
    frag.inputs.forEach((inp, i) => {
        console.log(`  [${i}] ${inp.type} ${inp.name || '(unnamed)'}`);
    });

    console.log('\nDecoded args (array order):');
    newest.parsed.args.forEach((v, i) => {
        console.log(`  [${i}] =`, typeof v === 'bigint' ? v.toString() : v);
    });

    console.log('\nDecoded args (named):');
    console.log(prettyArgs(newest.parsed.args));

    console.log(`\nTotal matches found: ${matches.length}`);
})();
