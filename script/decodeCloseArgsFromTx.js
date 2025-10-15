// ESM, ethers v6 — decode the function + args used in a prior successful close tx
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { JsonRpcProvider, Interface } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const RPC = process.env.VITE_RPC_URL || process.env.SEPOLIA_RPC_URL;

const TX_HASH = process.argv[2];
if (!TX_HASH) {
    console.error('Usage: node script/decodeCloseArgsFromTx.js <txHash>');
    process.exit(1);
}

async function main() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const abi = JSON.parse(raw).abi;
    const iface = new Interface(abi);

    const provider = new JsonRpcProvider(RPC);
    const tx = await provider.getTransaction(TX_HASH);
    if (!tx) {
        console.error('No transaction found. Hash correct?');
        process.exit(1);
    }

    console.log('engine :', ENGINE);
    console.log('tx     :', TX_HASH);
    console.log('to     :', tx.to);
    console.log('from   :', tx.from);

    // Try to parse the call data by every function in the ABI
    let parsed = null;
    for (const f of abi.filter(x => x.type === 'function')) {
        try {
            const frag = iface.getFunction(f.name);
            const p = iface.decodeFunctionData(frag, tx.data);
            parsed = { name: f.name, args: p };
            break;
        } catch { /* keep trying */ }
    }

    if (!parsed) {
        console.log('Could not parse transaction data with this ABI.');
    } else {
        console.log('\n=== Parsed Call ===');
        console.log('fn   :', parsed.name);
        try {
            // pretty print bigints
            const j = JSON.stringify(parsed.args, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
            console.log('args :', j);
        } catch {
            console.log('args :', parsed.args);
        }
    }

    // Also decode any PositionClosed event in the receipt
    const rcpt = await provider.getTransactionReceipt(TX_HASH);
    if (rcpt) {
        const ev = abi.find(x => x.type === 'event' && x.name === 'PositionClosed');
        if (ev) {
            const topic0 = iface.getEvent(ev.name).topicHash;
            console.log('\n=== PositionClosed events in receipt ===');
            for (const log of rcpt.logs) {
                if (ENGINE && log.address.toLowerCase() !== ENGINE.toLowerCase()) continue;
                if (log.topics?.[0] !== topic0) continue;
                const decoded = iface.decodeEventLog(ev, log.data, log.topics);
                const pretty = JSON.stringify(decoded, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
                console.log(pretty);
            }
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
