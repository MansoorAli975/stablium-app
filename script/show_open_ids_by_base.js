// script/show_open_ids_by_base.js
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;
const USER = "0x156F3D3CE28ba1c0cFB077C2405C70125093Ad76";

const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

// try a bunch of likely bases; add more if you use others
const BASES = ["GBP", "EUR", "JPY", "USD", "AUD", "CAD", "CHF", "NZD", "XAU", "XAG", "BTC", "ETH"];

(async () => {
    const p = new ethers.JsonRpcProvider(RPC);
    const c = new ethers.Contract(ENGINE, ABI, p);

    const total = await c.getOpenPositionCount(USER);
    console.log("getOpenPositionCount:", total.toString());

    for (const base of BASES) {
        try {
            const ids = await c.getOpenPositionIds(USER, base);
            if (!ids.length) { console.log(`${base}: []`); continue; }
            const asBn = ids.map(x => BigInt(x));
            console.log(`${base}:`, asBn.map(x => x.toString()));

            // probe each id with keeper + closePosition (static)
            for (const id of asBn) {
                try {
                    const r = await c.checkTpSlAndClose.staticCall(id);
                    console.log(`  keeper.static(${id}) =>`, r);
                } catch (e) {
                    const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
                    console.log(`  keeper.static(${id}) revert:`, msg);
                }

                try {
                    const r2 = await c.closePosition.staticCall(id, 1n);
                    console.log(`  close.static(${id},1) =>`, r2);
                } catch (e) {
                    const msg = (e?.reason || e?.shortMessage || e?.message || "").toString();
                    console.log(`  close.static(${id},1) revert:`, msg);
                }
            }
        } catch (e) {
            // ignore bases the engine doesn't know
            // console.log(`${base}: query failed (${e.message})`);
        }
    }
})();
