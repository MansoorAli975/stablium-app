// script/inspectHealth.js  (Node + ethers v6) — READ-ONLY
// Usage: node script/inspectHealth.js <positionIndex>
import 'dotenv/config';
import { ethers } from 'ethers';

const RPC = process.env.SEPOLIA_RPC_URL || process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS || process.env.ENGINE_ADDRESS;

if (!RPC || !ENGINE) {
    console.error('Missing RPC or ENGINE address. Set SEPOLIA_RPC_URL (or VITE_RPC_URL) and VITE_ENGINE_ADDRESS.');
    process.exit(1);
}

const index = process.argv[2] ? BigInt(process.argv[2]) : 0n;

const ABI = [
    // risk params
    'function maintenanceMarginBps() view returns (uint256)',           // preferred
    'function getMaintenanceMarginBps() view returns (uint256)',        // alt
    'function initialMarginBps() view returns (uint256)',               // extra info

    // price
    'function getDerivedPrice(string base, string quote) view returns (uint256)',

    // liquidation helpers (varies by engine)
    'function canLiquidate(uint256) view returns (bool)',
    'function isLiquidatable(uint256) view returns (bool)',

    // positions (we don’t know exact struct; try a few shapes)
    // try a generic getter first:
    'function getPosition(uint256) view returns (tuple(bool isOpen,bool isLong,string pair,uint256 entryPrice,uint256 tradeSize,uint256 takeProfitPrice,uint256 stopLossPrice,uint256 leverage,uint256 marginUsed,uint256 timestamp,uint256 closeTimestamp,int256 pnl))',
    // fallback to a plain array accessor:
    'function positions(uint256) view returns (bool isOpen,bool isLong,string pair,uint256 entryPrice,uint256 tradeSize,uint256 takeProfitPrice,uint256 stopLossPrice,uint256 leverage,uint256 marginUsed,uint256 timestamp,uint256 closeTimestamp,int256 pnl)',
];

function fmt1e18(bi) {
    try { return Number(ethers.formatUnits(bi ?? 0n, 18)); } catch { return 0; }
}
function bpsToPct(bps) { return Number(bps) / 100; }

async function safeCall(fn, ...args) {
    try { return await fn(...args); } catch { return undefined; }
}

async function getMmBps(engine) {
    let mm = await safeCall(engine.maintenanceMarginBps);
    if (mm == null) mm = await safeCall(engine.getMaintenanceMarginBps);
    return mm;
}

async function getPos(engine, i) {
    // try getPosition() first
    let p = await safeCall(engine.getPosition, i);
    if (p) return p;
    // then positions()
    p = await safeCall(engine.positions, i);
    if (p) return p;
    return undefined;
}

async function main() {
    const provider = new ethers.JsonRpcProvider(RPC);
    const engine = new ethers.Contract(ENGINE, ABI, provider);

    console.log('Engine:', ENGINE);
    console.log('Index :', String(index));

    // ---- maintenance margin
    const mmBps = await getMmBps(engine);
    const imBps = await safeCall(engine.initialMarginBps);
    if (mmBps != null) console.log('maintenanceMarginBps:', String(mmBps), `(${bpsToPct(mmBps)}%)`);
    else console.log('maintenanceMarginBps: <unavailable>');
    if (imBps != null) console.log('initialMarginBps    :', String(imBps), `(${bpsToPct(imBps)}%)`);

    // ---- load position
    const pos = await getPos(engine, index);
    if (!pos) {
        console.log('Position: <unavailable – need the exact ABI for your engine>');
        return;
    }

    // normalize tuple access across shapes
    const isOpen = Boolean(pos.isOpen ?? pos[0]);
    const isLong = Boolean(pos.isLong ?? pos[1]);
    const pair = String(pos.pair ?? pos[2] ?? 'EUR'); // base symbol stored by your engine (UI treats as BASE/USD)
    const entry = pos.entryPrice ?? pos[3] ?? 0n;      // feed decimals scaled (often 1e8) — BUT engine PnL uses 1e18
    const sizeUsd = pos.tradeSize ?? pos[4] ?? 0n;       // 1e18 USD notional (your UI shows this as Volume (USD))
    const lev = pos.leverage ?? pos[7] ?? 0n;        // 1e18 or plain? (your UI shows it as an integer multiplier)
    const marginW = pos.marginUsed ?? pos[8] ?? 0n;      // 1e18 WETH collateral

    // engine’s price for PnL is 1e18 (as you used in the UI). We’ll fetch base/USD @1e18
    const curr1e18 = await engine.getDerivedPrice(pair, 'USD').catch(() => 0n);

    // many engines store entryPrice in feed-decimals (e.g., 1e8). Your UI rescales it before PnL.
    // We’ll compute entry@1e18 the same way: get base/USD from engine *at entry* is not available,
    // so we’ll rely on your UI’s logic: PnL = size * (curr - entryScaled) / entryScaled with entryScaled in 1e18.
    // If the engine already stores entry in 1e18, this cast is fine.
    const entry1e18 = (entry.toString().length > 18)
        ? entry // already large; treat as 1e18
        : (entry * 10n ** 10n); // typical 1e8 -> 1e18

    // compute PnL like the UI
    let pnl = 0n;
    if (entry1e18 && curr1e18) {
        const delta = curr1e18 - entry1e18;
        const signed = isLong ? delta : -delta;
        pnl = (sizeUsd * signed) / entry1e18; // 1e18 USD
    }

    // equity ≈ margin(USD) + pnl
    // margin is WETH; convert to USD using ETH/USD from engine (you already feed ETH).
    const ethUsd1e18 = await engine.getDerivedPrice('ETH', 'USD').catch(() => 0n);
    const marginUsd1e18 = (marginW && ethUsd1e18) ? (marginW * ethUsd1e18) / 10n ** 18n : 0n;
    const equity1e18 = marginUsd1e18 + pnl;

    // requirement = size * mmBps / 10000
    let req1e18 = 0n;
    if (mmBps != null) req1e18 = (sizeUsd * BigInt(mmBps)) / 10000n;

    const canLiq =
        (await safeCall(engine.canLiquidate, index)) ??
        (await safeCall(engine.isLiquidatable, index)) ??
        (equity1e18 <= req1e18); // heuristic if no view exists

    console.log('--- Position snapshot ---');
    console.log('isOpen    :', isOpen);
    console.log('direction :', isLong ? 'LONG' : 'SHORT');
    console.log('pair      :', `${pair}/USD`);
    console.log('entry@1e18:', entry1e18.toString());
    console.log('curr @1e18:', curr1e18.toString());
    console.log('size  USD :', sizeUsd.toString());
    console.log('lev       :', lev.toString());
    console.log('margin W  :', marginW.toString());
    console.log('ETH/USD   :', ethUsd1e18.toString());
    console.log('pnl  USD  :', ethers.formatUnits(pnl, 18));
    console.log('equityUSD :', ethers.formatUnits(equity1e18, 18));
    if (mmBps != null) {
        console.log('mm requirement USD :', ethers.formatUnits(req1e18, 18), `(${bpsToPct(mmBps)}%)`);
    }
    console.log('LIQUIDATABLE (view/heuristic):', Boolean(canLiq));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
