// script/probe_with_from.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const TRADER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76"; // your user

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

// try the two candidates we used most often
const IDS = [16n, 121975898n];

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    for (const id of IDS) {
        console.log(`\n== id ${id.toString()} with from=${TRADER} ==`);

        // keeper (usually permissionless, but we check anyway)
        try {
            const r = await c.checkTpSlAndClose.staticCall(id, { from: TRADER });
            console.log("keeper.static →", r);
        } catch (e) {
            console.log("keeper.static revert →", e?.reason || e?.shortMessage || e?.message);
        }

        // manual close (often owner-gated)
        try {
            const r2 = await c.closePosition.staticCall(id, 1n, { from: TRADER });
            console.log("close.static (bound=1) →", r2);
        } catch (e) {
            console.log("close.static (bound=1) revert →", e?.reason || e?.shortMessage || e?.message);
        }
    }
})();
