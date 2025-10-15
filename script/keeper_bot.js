// script/keeper_bot.js
// ESM, ethers v6
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC =
    process.env.VITE_RPC_URL ||
    process.env.SEPOLIA_RPC_URL;

const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const PK =
    process.env.KEEPER_PRIVATE_KEY || process.env.PRIVATE_KEY;
const BASES = (process.env.BASES || 'EUR,GBP,JPY')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);

const LOOP_MS = Number(process.env.LOOP_MS || '8000');

if (!RPC) throw new Error('Missing VITE_RPC_URL or SEPOLIA_RPC_URL');
if (!ENGINE) throw new Error('Missing VITE_ENGINE_ADDRESS');
if (!PK) throw new Error('Missing KEEPER_PRIVATE_KEY/PRIVATE_KEY (must be the trader wallet)');

const ENGINE_ABI = [
    'function getOpenPositionIds(address,string) view returns (uint256[])',
    'function getAllUserPositions(address) view returns (tuple(address user,string pair,bool isLong,uint256 entryPrice,uint256 marginUsed,uint256 leverage,uint256 tradeSize,uint256 timestamp,bool isOpen,uint256 exitPrice,int256 pnl,uint256 closeTimestamp,uint256 takeProfitPrice,uint256 stopLossPrice,uint256 liquidationPrice,uint256 baseUnits)[])',
    'function checkTpSlAndClose(uint256) returns (bool)',
];

const TRADER = process.env.TRADER; // your trader address
if (!TRADER) throw new Error('Missing TRADER (owner of positions)');

const provider = new ethers.JsonRpcProvider(
    RPC,
    { chainId: 11155111, name: 'sepolia' }   // ✅ correct: pass the network object directly
);


const wallet = new ethers.Wallet(PK, provider);
const engine = new ethers.Contract(ENGINE, ENGINE_ABI, wallet);

// simple backoff per index
const backoff = new Map(); // idx -> nextEpochMs

async function healthy() {
    // quick smoke test so we fail fast if RPC is unhappy
    const [block, net] = await Promise.all([
        provider.getBlockNumber(),
        provider.getNetwork()
    ]);
    console.log(`[keeper] RPC ok. chainId=${net.chainId} block=${block}`);
}

async function wouldClose(idx) {
    try {
        await engine.checkTpSlAndClose.staticCall(idx);
        return true;
    } catch {
        return false;
    }
}

async function tryClose(idx) {
    const now = Date.now();
    const nextAt = backoff.get(idx) || 0;
    if (now < nextAt) return false;

    try {
        if (await wouldClose(idx)) {
            const tx = await engine.checkTpSlAndClose(idx);
            console.log(`[keeper] CLOSE idx=${idx} tx=${tx.hash}`);
            const rc = await tx.wait();
            console.log(`[keeper] CONFIRMED idx=${idx} block=${rc.blockNumber}`);
            backoff.delete(idx);
            return true;
        } else {
            // no trigger; back off a bit
            backoff.set(idx, now + 10_000);
        }
    } catch (e) {
        console.log(`[keeper] no-close idx=${idx}: ${e.shortMessage || e.message || e}`);
        backoff.set(idx, now + 15_000);
    }
    return false;
}

async function loopOnce() {
    for (const base of BASES) {
        try {
            const ids = await engine.getOpenPositionIds(TRADER, base);
            // process sequentially to avoid rate spikes
            for (const id of ids) {
                const idx = Number(id);
                await tryClose(idx);
            }
        } catch (e) {
            console.log(`[keeper] getOpenPositionIds(${base}) failed: ${e.shortMessage || e.message || e}`);
        }
    }
}

async function main() {
    console.log(`[keeper] rpc=${RPC}`);
    console.log(`[keeper] engine=${ENGINE}`);
    console.log(`[keeper] trader=${TRADER}`);
    console.log(`[keeper] bases=[${BASES.join(',')}] tick=${LOOP_MS}ms`);
    await healthy();

    // kick once, then poll
    await loopOnce();
    setInterval(loopOnce, LOOP_MS);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
