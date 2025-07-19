// // utils/quoteAPI.js

import { USE_MOCK_DATA } from "./dataMode";

const API_KEY = "67abe2b380fe4865ae0f7a829a8a99f6";

export async function fetchQuotePrice(symbol = "EUR/USD") {
    if (USE_MOCK_DATA) {
        // 🔁 Return simulated quote
        const basePrice = 1.1200;
        const fluctuation = (Math.random() - 0.5) * 0.001; // ±0.0005
        const price = +(basePrice + fluctuation).toFixed(5);
        const bid = +(price - 0.00005).toFixed(5);
        const ask = +(price + 0.00005).toFixed(5);

        console.log("🧪 Mock Quote Price:", { bid, ask, price });
        return { bid, ask, price };
    } else {
        try {
            const response = await fetch(
                `https://api.twelvedata.com/quote?symbol=${symbol}&apikey=${API_KEY}`
            );
            const data = await response.json();
            console.log("🌐 Quote from Twelve Data (Direct):", data);

            const fallbackBid = 1.11995;
            const fallbackAsk = 1.12005;

            const bid = parseFloat(data.bid) || fallbackBid;
            const ask = parseFloat(data.ask) || fallbackAsk;
            const price = parseFloat(data.close) || (bid + ask) / 2;

            if (!data.bid || !data.ask || !data.close) {
                console.warn("⚠️ Incomplete data. Using fallback.");
            }

            return { bid, ask, price };
        } catch (error) {
            console.error("❌ Error fetching forex quote (Live):", error);
            return {
                bid: 1.11995,
                ask: 1.12005,
                price: 1.12,
            };
        }
    }
}
