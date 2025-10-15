// scripts/abi_sanity_v3.js (v3b)
import { readFileSync } from "fs";
import { ethers } from "ethers";

const RPC = process.env.VITE_RPC_URL;
const ENGINE = process.env.VITE_ENGINE_ADDRESS;

// Accept either full Forge artifact or raw ABI array
const raw = JSON.parse(readFileSync(process.env.ENGINE_ABI_PATH, "utf8"));
const ABI = raw.abi ?? raw;

const MUST_FUNCS = [
    "checkTpSlAndClose(uint256)",
    "closePosition(uint256,uint256)",
    "getSyntheticPriceFeed(string)",
    "getUserOpenIndices(address,string)",
    "getPositionTuple(address,string,uint256)",
];

// Known tx you shared
const KNOWN_TX = "0x1daf091308b8d5d18dd0fa42e91cef949df8d0a55f6e59555e31928fe353fcaf";

(async () => {
    const iface = new ethers.Interface(ABI);

    console.log("== Function selectors present in ABI ==");
    for (const fn of MUST_FUNCS) {
        try {
            const sel = iface.getFunction(fn).selector;
            console.log("  ✅", fn, sel);
        } catch {
            console.log("  ❌", fn, "(missing)");
        }
    }

    // Just list Position* event names present in THIS ABI
    const posEvents = ABI.filter(x => x.type === "event" && /^Position(Opened|Closed)/.test(x.name));
    if (!posEvents.length) {
        console.log("\n⚠️ No Position* events found in ABI.");
    } else {
        console.log("\n== Position* events present in ABI ==");
        for (const e of posEvents) console.log("  •", e.name);
    }

    // Try decoding your known tx logs with THIS ABI
    const provider = new ethers.JsonRpcProvider(RPC);
    let receipt;
    try {
        receipt = await provider.getTransactionReceipt(KNOWN_TX);
    } catch {
        console.log("\n⚠️ Could not fetch known tx receipt (check hash/RPC).");
        return;
    }

    console.log(`\n== Decoding logs from ${KNOWN_TX} ==`);
    let anyFromEngine = false;
    for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== ENGINE.toLowerCase()) continue;
        anyFromEngine = true;
        try {
            const parsed = iface.parseLog(log);
            console.log("  ✅", parsed.name, JSON.stringify(parsed.args));
        } catch (e) {
            console.log("  ❌ Failed to decode with current ABI (topic =", log.topics[0], ")");
        }
    }
    if (!anyFromEngine) {
        console.log("⚠️ No logs from ENGINE address in this tx. Double-check tx hash or ENGINE address.");
    }
})();
