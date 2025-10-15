// script/debugEngineLogsForTx.js
// ESM, ethers v6 — dump ALL logs from the engine in a tx, with raw topics/data and best-effort decode.
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Interface, getBytes } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = (process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS || '').toLowerCase();
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

if (!RPC || !ENGINE) {
    console.error('Missing RPC or ENGINE address in env.');
    process.exit(1);
}

const txHash = process.argv[2];
if (!txHash) {
    console.error('Usage: node script/debugEngineLogsForTx.js <txHash>');
    process.exit(1);
}

const abi = JSON.parse(readFileSync(ABI_PATH, 'utf8')).abi;
const iface = new Interface(abi);

function chunk32(hex) {
    const h = hex.startsWith('0x') ? hex.slice(2) : hex;
    const out = [];
    for (let i = 0; i < h.length; i += 64) {
        out.push('0x' + h.slice(i, i + 64));
    }
    return out;
}

async function main() {
    const provider = new JsonRpcProvider(RPC);
    const rcpt = await provider.getTransactionReceipt(txHash);
    if (!rcpt) {
        console.error('No receipt found. Is the hash correct / tx mined?');
        process.exit(1);
    }

    let any = false;
    for (const log of rcpt.logs || []) {
        if ((log.address || '').toLowerCase() !== ENGINE) continue;
        any = true;

        console.log('--- ENGINE LOG ---');
        console.log('address:', log.address);
        console.log('topics :', log.topics);
        console.log('data   :', log.data);
        console.log('data32 :', chunk32(log.data));
        try {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            console.log('name   :', parsed?.name);
            console.log(
                'args   :',
                JSON.stringify(parsed?.args, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
            );
            if (parsed?.fragment?.inputs) {
                console.log(
                    'inputs :',
                    parsed.fragment.inputs.map((i) => `${i.type} ${i.name || ''}`.trim())
                );
            }
        } catch (e) {
            console.log('decode : (failed to parse with ABI)');
        }
        console.log('');
    }

    if (!any) {
        console.error('No engine logs found in this tx.');
        process.exit(2);
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
