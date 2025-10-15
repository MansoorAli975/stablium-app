// script/keeper_and_close_now.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const TRADER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76";
const UI = 16n;

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

const FEEDS = {
    GBP: ["GBP/USD", "0x5bc612F21D49325c54E5C7a3c106adce3e07333F"],
    EUR: ["EUR/USD", "0x79cE6945D82f2E024A8555632411e6Bd38667fA7"],
    JPY: ["JPY/USD", "0xFD76c6D0ac529CF88C3be65BA1305C6118aDd01B"],
};

const feedAbi = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];

function fmt(n, dp) {
    const s = BigInt(n).toString().padStart(dp + 1, "0");
    return s.slice(0, -dp) + "." + s.slice(-dp);
}

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    // 1) show ages right now (so we can see if it’s freshness gating)
    const now = Math.floor(Date.now() / 1000);
    for (const [sym, [name, addr]] of Object.entries(FEEDS)) {
        const f = new ethers.Contract(addr, feedAbi, p);
        const dp = Number(await f.decimals());
        const [, ans, , updatedAt] = await f.latestRoundData();
        const age = now - Number(updatedAt);
        console.log(`${name} = ${fmt(BigInt(ans), dp)} | age=${age}s`);
    }

    // 2) derived price + threshold using the actual TP slot
    const buf = await c.priceTriggerBuffer();
    const all = await c.getAllUserPositions(TRADER);
    const pos = all[Number(UI)];
    const TP = pos[12]; // from your tuple
    const dp = 8n;
    const px18 = await c.getDerivedPrice("GBP", "USD");
    const pxFU = (px18 * 10n ** dp) / 10n ** 18n;
    const thr = BigInt(TP) + BigInt(buf);
    const meets = pxFU >= thr;

    console.log(`ENGINE derived GBP/USD = ${px18.toString()} (feed=${fmt(pxFU, Number(dp))})`);
    console.log(`TP=${fmt(TP, Number(dp))}  buffer=${buf.toString()}  threshold=${fmt(thr, Number(dp))}  meets=${meets}`);

    // 3) keeper static from TRADER
    try {
        const r = await c.checkTpSlAndClose.staticCall(UI, { from: TRADER });
        console.log("keeper.static(UI=16) =>", r);
    } catch (e) {
        console.log("keeper.static(UI=16) revert =>", e.reason || e.shortMessage || e.message);
    }

    // 4) manual close static with 3 bounds (to learn semantics) from TRADER
    const bounds = [
        1n,                     // permissive if treated as minOut
        px18,                   // current price as 1e18
        ethers.MaxUint256       // permissive if treated as maxPrice
    ];
    for (const b of bounds) {
        try {
            const r = await c.closePosition.staticCall(UI, b, { from: TRADER });
            console.log(`close.static(UI, ${b.toString()}) => OK:`, r);
        } catch (e) {
            console.log(`close.static(UI, ${b.toString()}) => REVERT:`, e.reason || e.shortMessage || e.message);
        }
    }
})();
