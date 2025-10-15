// script/pushPrices.js
import 'dotenv/config';
import { ethers } from 'ethers';

const {
    SEPOLIA_RPC_URL,
    PRIVATE_KEY,
    EUR_FEED,
    GBP_FEED,
    JPY_FEED,
} = process.env;

if (!SEPOLIA_RPC_URL || !PRIVATE_KEY || !EUR_FEED || !GBP_FEED || !JPY_FEED) {
    throw new Error('Missing env vars: SEPOLIA_RPC_URL, PRIVATE_KEY, EUR_FEED, GBP_FEED, JPY_FEED');
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);
// Wrap in NonceManager to avoid nonce collisions
const wallet = new ethers.NonceManager(signer);

const iface = new ethers.Interface([
    'function setPrice(int256 newPrice)',
]);

// Simple “toy” price generators you can tweak
const base = {
    EUR: 117300000,   // 1.17300000 (8 decimals)
    GBP: 135000000,   // 1.35000000 (8 decimals)
    JPY: 680000,      // 0.00680000 (8 decimals)
};

let t = 0;
function nextPrices() {
    // tiny oscillation just to move charts ~ every tick
    const wiggle = (amp) => Math.floor(amp * Math.sin(t / 3));

    t += 1;
    return {
        EUR: base.EUR + wiggle(1200), // ~0.000012
        GBP: base.GBP + wiggle(1500),
        JPY: base.JPY + wiggle(50),
    };
}

// bump EIP-1559 fees a bit so replacements are always valid
async function feeBump(mult = 1.3) {
    const fd = await provider.getFeeData();
    const mp = fd.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei');
    const mf = fd.maxFeePerGas ?? ethers.parseUnits('3', 'gwei');
    return {
        maxPriorityFeePerGas: (mp * BigInt(Math.floor(mult * 100))) / 100n,
        maxFeePerGas: (mf * BigInt(Math.floor(mult * 100))) / 100n,
    };
}

async function push(pair, feed, price) {
    const fees = await feeBump(1.3);
    const tx = await wallet.sendTransaction({
        to: feed,
        data: iface.encodeFunctionData('setPrice', [price]),
        ...fees,
    });
    console.log(`Sent ${pair}=${price} -> ${tx.hash}`);
    await tx.wait(); // wait until mined before sending the next one
    console.log(`Mined ${pair}=${price}`);
}

async function tick() {
    try {
        const p = nextPrices();
        // send **sequentially** to avoid concurrent nonce use
        await push('EUR', EUR_FEED, p.EUR);
        await push('GBP', GBP_FEED, p.GBP);
        await push('JPY', JPY_FEED, p.JPY);
    } catch (err) {
        // If we ever hit REPLACEMENT_UNDERPRICED again, we just log it and try next tick
        console.error('Push error:', err.shortMessage || err.message || err);
    }
}

console.log('Pushing prices every 20 s');
console.log({ EUR_FEED, GBP_FEED, JPY_FEED });

tick(); // run immediately once
setInterval(tick, 20_000);
