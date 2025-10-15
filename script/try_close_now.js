// script/try_close_now.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76"; // trader (owner)
const UI = 16n; // your UI index

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    // read engine price to craft “sane” bounds (assuming 1e18-scaled)
    const px1e18 = await c.getDerivedPrice("GBP", "USD");

    // candidate bounds for a LONG: small, mid, current-ish, large
    const BOUNDS = [
        1n,                                 // effectively no slippage check if interpreted as minOut
        px1e18 / 4n,                        // loose
        (px1e18 * 9n) / 10n,                // 90% of current
        px1e18,                             // current
        (px1e18 * 11n) / 10n,               // 110% (to see if it's max-bound semantics)
        (1n << 255n)                        // huge (MaxUint256/2)
    ];

    console.log("engine GBP/USD (1e18) =", px1e18.toString());
    for (const b of BOUNDS) {
        try {
            const r = await c.closePosition.staticCall(UI, b, { from: USER });
            console.log("close.static bound", b.toString(), "=> OK:", r);
        } catch (e) {
            console.log("close.static bound", b.toString(), "=> REVERT:", e?.reason || e?.shortMessage || e?.message);
        }
    }
})();
