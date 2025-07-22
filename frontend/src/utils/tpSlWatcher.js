// utils/tpSlWatcher.js

import { getForexEngineContract } from "./contract";
import { ethers } from "ethers";

// ✅ Helper: fetch on-chain price using getDerivedPrice()
async function fetchOnChainPrice(symbol) {
    if (typeof window.ethereum === "undefined") {
        console.error("❌ MetaMask not found");
        return null;
    }

    try {
        await window.ethereum.request({ method: "eth_requestAccounts" });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = getForexEngineContract(provider);

        const [base, quote] = symbol.split("/"); // e.g., "EUR/USD"
        const priceRaw = await contract.getDerivedPrice(base, quote); // 18-decimals
        const price = parseFloat(ethers.formatUnits(priceRaw, 18));
        console.log(`🟢 On-chain price for ${symbol}: ${price}`);
        return price;
    } catch (err) {
        console.error("❌ Failed to fetch on-chain price:", err);
        return null;
    }
}

// ✅ TP/SL Auto-Watcher
export async function watchTpSl(userAddress) {
    if (typeof window.ethereum === "undefined") {
        console.error("❌ MetaMask not found");
        return;
    }

    try {
        await window.ethereum.request({ method: "eth_requestAccounts" });

        const provider = new ethers.BrowserProvider(window.ethereum);
        const contract = getForexEngineContract(provider);

        const allPositions = await contract.getUserPositionsPaginated(userAddress, 0, 100);

        for (let i = 0; i < allPositions.length; i++) {
            const pos = allPositions[i];
            if (!pos.isOpen) continue;

            const symbol = pos.pair;
            const currentPrice = await fetchOnChainPrice(symbol);
            if (!currentPrice) continue;

            const entryPrice = parseFloat(ethers.formatUnits(pos.entryPrice, 18));
            const tp = parseFloat(ethers.formatUnits(pos.takeProfitPrice, 18));
            const sl = parseFloat(ethers.formatUnits(pos.stopLossPrice, 18));
            const isLong = pos.isLong;

            const hitTP = isLong ? tp > 0 && currentPrice >= tp : tp > 0 && currentPrice <= tp;
            const hitSL = isLong ? sl > 0 && currentPrice <= sl : sl > 0 && currentPrice >= sl;

            if (hitTP || hitSL) {
                try {
                    const tx = await contract.closePosition(i);
                    await tx.wait();
                    console.log(`✅ Auto-closed position ${i} (${symbol}) at ${currentPrice} | TP: ${tp} | SL: ${sl}`);
                } catch (err) {
                    console.error(`❌ Failed to close position ${i} (${symbol})`, err);
                }
            }
        }
    } catch (err) {
        console.error("❌ Error in TP/SL watcher:", err);
    }
}
