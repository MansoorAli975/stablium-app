// script/getOpenedIndexFromTx.js
// ESM, ethers v6 — decode PositionOpened from a tx receipt and print the index
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Interface } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

if (!RPC || !ENGINE) {
    console.error('Missing RPC or ENGINE address in env.');
    process.exit(1);
}

const txHash = process.argv[2];
if (!txHash) {
    console.error('Usage: node script/getOpenedIndexFromTx.js <txHash>');
    process.exit(1);
}

const abi = JSON.parse(readFileSync(ABI_PATH, 'utf8')).abi;
const iface = new Interface(abi);

async function main() {
    const provider = new JsonRpcProvider(RPC);
    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt) {
        console.error('No receipt found. Is the hash correct / tx mined?');
        process.exit(1);
    }

    let found = false;
    for (const log of rcpt.logs || []) {
        if (log.address.toLowerCase() !== ENGINE.toLowerCase()) continue;
        try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            if (parsed?.name === 'PositionOpened') {
                found = true;
                // args could be named or indexed; print both ways
                const args = parsed.args;
                // Try common patterns: args.index or args.positionIndex or first numeric arg
                let index =
                    args?.index ??
                    args?.positionIndex ??
                    (Array.isArray(args) ? args.find((x) => typeof x === 'bigint') : null);

                console.log('--- PositionOpened decoded ---');
                console.log('engine  :', ENGINE);
                console.log('tx      :', txHash);
                console.log('name    :', parsed.name);
                console.log('args    :', JSON.stringify(args, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
                if (typeof index === 'bigint') {
                    console.log('INDEX   :', index.toString());
                } else {
                    console.log('INDEX   : (could not auto-pick from args; see above)');
                }
            }
        } catch {
            // not an engine event or ABI mismatch; ignore
        }
    }

    if (!found) {
        console.error('No PositionOpened event from the engine was found in this tx.');
        process.exit(2);
    }
}

main().catch((e) => { console.error(e); process.exit(1); });
