// script/dumpAllUserPositions.js
// ESM, ethers v6 — prints getAllUserPositions(user) with any id/index fields visible
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Contract } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json', 'utf8')).abi;

const USER = process.argv[2]; // e.g. 0x156F...Ad76
if (!RPC || !ENGINE || !USER) {
    console.error('Usage: node script/dumpAllUserPositions.js <USER_ADDRESS>');
    process.exit(1);
}

const toJSON = (v) =>
    JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2);

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, ABI, provider);

    const list = await engine.getAllUserPositions(USER); // tuple[]
    console.log(`Total returned: ${list.length}`);

    list.forEach((pos, i) => {
        console.log(`\n--- Position[${i}] ---`);
        console.log(toJSON(pos));

        // Try to surface likely index/id fields:
        const candidates = [];
        for (const key of Object.keys(pos)) {
            const v = pos[key];
            if (typeof v === 'bigint') {
                if (/index|id$/i.test(key)) candidates.push(`${key}=${v.toString()}`);
            }
        }
        if (candidates.length) {
            console.log('Index/id candidates:', candidates.join(', '));
        }
    });
})();
