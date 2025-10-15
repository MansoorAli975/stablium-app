// ESM, ethers v6 — print every ABI function (name, state mutability, inputs)
import 'dotenv/config';
import { readFileSync } from 'fs';

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

const json = JSON.parse(readFileSync(ABI_PATH, 'utf8'));
const abi = json.abi || json;

const fns = abi.filter((x) => x.type === 'function');

const views = fns.filter((f) => f.stateMutability === 'view' || f.stateMutability === 'pure');
const writes = fns.filter((f) => !(f.stateMutability === 'view' || f.stateMutability === 'pure'));

function sig(f) {
    const ins = f.inputs?.map((i) => `${i.type}${i.name ? ' ' + i.name : ''}`)?.join(', ') || '';
    const outs = f.outputs?.map((o) => o.type)?.join(', ') || '';
    return `${f.name}(${ins}) -> ${outs}`;
}

console.log('=== VIEW / PURE FUNCTIONS ===');
for (const f of views) {
    console.log(' -', sig(f));
}

console.log('\n=== WRITE FUNCTIONS ===');
for (const f of writes) {
    console.log(' -', sig(f));
}
