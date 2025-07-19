import React from "react";

const marketData = [
    { symbol: "EUR/USD", price: 1.1201 },
    { symbol: "GBP/USD", price: 1.2752 },
    { symbol: "USD/JPY", price: 145.72 },
    { symbol: "EUR/GBP", price: 0.8821 },
    { symbol: "EUR/JPY", price: 163.51 },
    { symbol: "GBP/JPY", price: 186.23 },
];

const Market = ({ onSelectSymbol }) => {
    return (
        <div className="market-section">
            <h3 className="market-heading">Market</h3>
            <div className="market-list">
                {marketData.map((item) => (
                    <div
                        key={item.symbol}
                        className="market-row"
                        onClick={() => onSelectSymbol(item.symbol)} // ✅ sends "EUR/USD"
                        style={{ cursor: "pointer" }}
                    >
                        <span className="market-symbol">{item.symbol}</span>
                        <span className="market-price">{item.price}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Market;
