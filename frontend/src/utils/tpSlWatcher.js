// import { getForexEngineContract } from "./contract";
// import { ethers } from "ethers";

// // Optional: You can still keep this for other uses
// export async function fetchOnChainPrice(symbol) {
//     if (typeof window.ethereum === "undefined") {
//         console.error("MetaMask not found");
//         return null;
//     }

//     try {
//         const provider = new ethers.BrowserProvider(window.ethereum);
//         const contract = getForexEngineContract(provider);
//         const [base, quote] = symbol.split("/");

//         const raw = await contract.getDerivedPrice(base, quote);
//         return parseFloat(ethers.formatUnits(raw, 18));
//     } catch (err) {
//         console.error("Failed to fetch on-chain price:", err);
//         return null;
//     }
// }

// // ✅ REPLACED: This is the new TP/SL watcher using the updated smart contract
// export async function watchTpSl(userAddress) {
//     if (typeof window.ethereum === "undefined") return;

//     try {
//         const provider = new ethers.BrowserProvider(window.ethereum);
//         const signer = await provider.getSigner();
//         const contract = getForexEngineContract(signer);

//         const positions = await contract.getAllUserPositions(userAddress);

//         for (let i = 0; i < positions.length; i++) {
//             const pos = positions[i];
//             if (!pos.isOpen) continue;

//             const symbol = pos.pair; // must match what you store on-chain, e.g., "EUR/USD"
//             try {
//                 const tx = await contract.checkTpSlAndClose(userAddress, symbol);
//                 await tx.wait();
//                 console.log(`✅ TP/SL check executed for ${symbol}`);
//             } catch (err) {
//                 const msg = err?.message || err?.toString();
//                 if (!msg.includes("PriceNotAtTrigger")) {
//                     console.error(`❌ Failed to check TP/SL for ${symbol}:`, err);
//                 }
//             }
//         }
//     } catch (err) {
//         console.error("💥 Error in TP/SL watcher:", err);
//     }
// }

// frontend/src/utils/tpSlWatcher.js
import { getForexEngineContract } from "./contract";
import { ethers } from "ethers";

/**
 * Still useful for charts/UI reads — safe, read-only.
 */
export async function fetchOnChainPrice(symbol) {
    if (typeof window.ethereum === "undefined") return null;

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = getForexEngineContract(provider);
        const [base, quote] = symbol.split("/");
        const raw = await contract.getDerivedPrice(base, quote);
        return parseFloat(ethers.formatUnits(raw, 18));
    } catch (err) {
        console.error("Failed to fetch on-chain price:", err);
        return null;
    }
}

/**
 * TEMPORARILY DISABLED:
 * We’re pausing automatic TP/SL checks to avoid reverts while we
 * finalize fresh price feeds for all pairs.
 */
export async function watchTpSl(/* userAddress */) {
    // no-op on purpose
    return;
}
