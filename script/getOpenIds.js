// script/getOpenIds.js
// ESM, ethers v6 — prints open position indices for a user & pair (e.g., GBP)
import 'dotenv/config';
import { readFileSync } from 'fs';
import { JsonRpcProvider, Contract } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;
const ABI_PATH = process.env.ENGINE_ABI_PATH || 'out/ForexEngine.sol/ForexEngine.json';

const USER = process.argv[2];          // e.g., 0x156F...
const PAIR = process.argv[3] || 'GBP'; // base symbol string used by engine

if (!RPC || !ENGINE || !USER) {
    console.error('Usage: node script/getOpenIds.js <USER_ADDRESS> [PAIR]');
    process.exit(1);
}

const abi = JSON.parse(readFileSync(ABI_PATH, 'utf8')).abi;

(async () => {
    const provider = new JsonRpcProvider(RPC);
    const engine = new Contract(ENGINE, abi, provider);

    const ids = await engine.getOpenPositionIds(USER, PAIR); // uint256[]
    const out = ids.map((x) => x.toString());
    console.log(`User: ${USER}`);
    console.log(`Pair: ${PAIR}`);
    console.log(`Open indices: ${out.length ? out.join(', ') : '(none)'}`);
})();
