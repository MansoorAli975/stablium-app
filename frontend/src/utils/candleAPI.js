// src/utils/candleAPI.js
import axios from "axios";
import { USE_MOCK_DATA } from "./dataMode";

const API_KEY = "67abe2b380fe4865ae0f7a829a8a99f6";

export const fetchCandles = async (symbol = "EUR/USD") => {
    if (USE_MOCK_DATA) {
        // 🧪 Return mock candles
        const now = Math.floor(Date.now() / 1000);
        const candles = [];

        let price = 1.1200;
        for (let i = 50; i > 0; i--) {
            const timestamp = now - i * 60;
            const open = +(price + (Math.random() - 0.5) * 0.0005).toFixed(5);
            const close = +(open + (Math.random() - 0.5) * 0.0003).toFixed(5);
            const high = Math.max(open, close) + Math.random() * 0.0003;
            const low = Math.min(open, close) - Math.random() * 0.0003;

            candles.push({
                time: timestamp,
                open: +open.toFixed(5),
                high: +high.toFixed(5),
                low: +low.toFixed(5),
                close: +close.toFixed(5),
            });

            price = close; // Continue from previous
        }

        console.log("🧪 Mock Candles:", candles);
        return candles;
    } else {
        // 🌐 Live API call
        try {
            console.log("📩 Requesting live candles for:", symbol);

            const response = await axios.get("https://api.twelvedata.com/time_series", {
                params: {
                    symbol,
                    interval: "1min",
                    outputsize: 50,
                    apikey: API_KEY,
                },
            });

            const rawData = response.data?.values || [];
            console.log("🕯️ Raw candles from Twelve Data:", rawData);

            if (!Array.isArray(rawData) || rawData.length === 0) return [];

            const formatted = rawData.reverse().map((item) => ({
                time: Math.floor(new Date(item.datetime).getTime() / 1000),
                open: parseFloat(item.open),
                high: parseFloat(item.high),
                low: parseFloat(item.low),
                close: parseFloat(item.close),
            }));

            console.log("📊 Formatted Candles:", formatted);
            return formatted;
        } catch (error) {
            console.error("❌ Error fetching live candles:", error);
            return [];
        }
    }
};

