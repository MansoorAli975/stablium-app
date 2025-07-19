import { contract } from "./contract";
import { getCurrentPrice } from "./quoteAPI";
import { ethers } from "ethers";

export async function watchTpSl(userAddress) {
    try {
        const allPositions = await contract.getUserPositionsPaginated(userAddress, 0, 100);

        allPositions.forEach(async (pos, index) => {
            const symbol = pos.pair;
            const currentPrice = await getCurrentPrice(symbol);

            const entryPrice = Number(pos.entryPrice);
            const tp = Number(pos.takeProfitPrice);
            const sl = Number(pos.stopLossPrice);
            const isLong = pos.isLong;

            if (pos.isOpen) {
                const hitTP = isLong ? tp > 0 && currentPrice >= tp : tp > 0 && currentPrice <= tp;
                const hitSL = isLong ? sl > 0 && currentPrice <= sl : sl > 0 && currentPrice >= sl;

                if (hitTP || hitSL) {
                    try {
                        const tx = await contract.closePosition(index);
                        await tx.wait();
                        console.log(`Auto-closed position ${index} for ${symbol} at price ${currentPrice}`);
                    } catch (err) {
                        console.error("ClosePosition failed for index", index, err);
                    }
                }
            }
        });
    } catch (err) {
        console.error("Error in TP/SL watcher:", err);
    }
}
