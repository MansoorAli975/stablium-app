// script/checkTxAndPositions.js (ESM-safe, no import assertions)
import 'dotenv/config';
import { JsonRpcProvider, Contract } from 'ethers';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const engineArtifact = require('../out/ForexEngine.sol/ForexEngine.json');

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.ENGINE_ADDRESS || process.env.VITE_ENGINE_ADDRESS || '0x1da038c579096b9C11adD7af8429979D703Ae543';
const USER = process.env.TRADER || '0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76';

const HASH = process.argv[2]; // pass the tx hash from the UI

(async () => {
    if (!RPC || !ENGINE || !USER || !HASH) {
        console.error('Usage: node script/checkTxAndPositions.js <txHash>');
        process.exit(1);
    }
    const provider = new JsonRpcProvider(RPC);

    console.log('Waiting for tx:', HASH);
    const receipt = await provider.waitForTransaction(HASH);
    console.log('Receipt status:', receipt?.status, 'block:', receipt?.blockNumber);

    const engine = new Contract(ENGINE, engineArtifact.abi, provider);
    const ps = await engine.getAllUserPositions(USER);
    console.log('Positions for', USER, '=>', ps.length);

    if (ps.length) {
        const last = ps[ps.length - 1];
        console.log({
            pair: last.pair,
            isLong: last.isLong,
            marginUsed: last.marginUsed.toString(),
            leverage: last.leverage.toString(),
            entryPrice: last.entryPrice.toString(),
            isOpen: last.isOpen,
        });
    }
})();
