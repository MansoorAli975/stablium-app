import React, { useEffect, useState } from "react";
import { fetchQuotePrice } from "../utils/quoteAPI";

const marketSymbols = [
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "EUR/GBP",
    "EUR/JPY",
    "GBP/JPY",
];

const Market = ({ onSelectSymbol, selectedSymbol }) => {
    const [livePrices, setLivePrices] = useState({});

    // ✅ Fetch all prices periodically
    useEffect(() => {
        const fetchAllPrices = async () => {
            const prices = {};
            for (let symbol of marketSymbols) {
                const result = await fetchQuotePrice(symbol);
                prices[symbol] = result?.price ?? 0;
            }
            setLivePrices(prices);
        };

        fetchAllPrices();
        const interval = setInterval(fetchAllPrices, 60000); // every 60s
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="market-section">
            <h3 className="market-heading">Market</h3>
            <div className="market-list">
                {marketSymbols.map((symbol) => (
                    <div
                        key={symbol}
                        className={`market-row ${symbol === selectedSymbol ? "selected" : ""}`}
                        onClick={() => onSelectSymbol(symbol)}
                        style={{ cursor: "pointer" }}
                    >
                        <span className="market-symbol">{symbol}</span>
                        <span className="market-price">
                            {livePrices[symbol] ? livePrices[symbol].toFixed(5) : "Loading..."}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Market;
