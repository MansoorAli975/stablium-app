// script/findLiquidationFns.js (ethers v6 not required here; pure ABI scan)
import 'dotenv/config';
import fs from 'fs';
import path from 'path';

const ENGINE_ABI_PATH =
    process.env.ENGINE_ABI_PATH ||
    'out/ForexEngine.sol/ForexEngine.json';

function loadAbi(p) {
    const json = JSON.parse(fs.readFileSync(p, 'utf8'));
    return json.abi || json;
}

const interesting = ['liquid', 'settle', 'close', 'margin', 'tp', 'sl', 'trigger'];

function formatInputs(inputs = []) {
    return inputs.map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ');
}

(function main() {
    const abiPath = path.resolve(ENGINE_ABI_PATH);
    const abi = loadAbi(abiPath);
    const fns = abi.filter(e => e.type === 'function');

    // 1) Show *state-changing* functions that look relevant
    const writes = fns.filter(f =>
        f.stateMutability !== 'view' && f.stateMutability !== 'pure' &&
        interesting.some(k => f.name.toLowerCase().includes(k))
    );

    // 2) Show *view* helpers that look relevant
    const views = fns.filter(f =>
        (f.stateMutability === 'view' || f.stateMutability === 'pure') &&
        interesting.some(k => f.name.toLowerCase().includes(k))
    );

    console.log('ABI :', abiPath, '\n');

    console.log('=== Write functions (possible keeper actions) ===');
    if (writes.length === 0) {
        console.log('  <none matched>');
    } else {
        for (const f of writes) {
            console.log(`  ${f.name}(${formatInputs(f.inputs)})  state=${f.stateMutability}`);
        }
    }

    console.log('\n=== View functions (signals / checks) ===');
    if (views.length === 0) {
        console.log('  <none matched>');
    } else {
        for (const f of views) {
            console.log(`  ${f.name}(${formatInputs(f.inputs)})  state=${f.stateMutability}`);
        }
    }
})();
