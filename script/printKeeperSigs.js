// script/printKeeperSigs.js  (ESM, ethers v6)
import 'dotenv/config';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Interface } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

async function loadAbi() {
    const abs = path.resolve(__dirname, '..', ABI_PATH);
    const raw = await readFile(abs, 'utf8');
    const json = JSON.parse(raw);
    if (!json.abi) throw new Error(`No "abi" in ${abs}`);
    return { abi: json.abi, abs };
}

function sigOf(frag) {
    try { return frag.format('full'); } catch { return frag.name; }
}

(async () => {
    const { abi, abs } = await loadAbi();
    const iface = new Interface(abi);

    const wanted = ['check', 'tp', 'sl', 'close']; // keywords
    const funcs = iface.fragments
        .filter(f => f.type === 'function')
        .filter(f => {
            const n = (f.name || '').toLowerCase();
            return wanted.some(w => n.includes(w));
        });

    console.log('ABI :', abs);
    console.log('---- Keeper/Close-like functions found ----');
    for (const f of funcs) {
        const inputs = (f.inputs || []).map(i => `${i.type}${i.name ? ' ' + i.name : ''}`).join(', ');
        console.log(`- ${f.name}(${inputs})  => mutability=${f.stateMutability}`);
        console.log(`  signature: ${sigOf(f)}`);
    }
})();
