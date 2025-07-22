import { useState } from "react";
import "../styles.css";

const BottomPanel = ({ tradeHistory = [] }) => {
    const [activeTab, setActiveTab] = useState("trades");

    const renderProfitCell = (profitStr) => {
        const profit = parseFloat(profitStr);
        const isPositive = profit > 0;

        return (
            <div className={`profit ${isPositive ? "positive" : "negative"}`}>
                {isPositive ? "▲" : "▼"} {profitStr}
            </div>
        );
    };

    return (
        <div className="bottom-panel">
            <div className="bottom-tabs">
                <button
                    className={`tab-button ${activeTab === "trades" ? "active" : ""}`}
                    onClick={() => setActiveTab("trades")}
                >
                    Trades
                </button>
                <button
                    className={`tab-button ${activeTab === "history" ? "active" : ""}`}
                    onClick={() => setActiveTab("history")}
                >
                    History
                </button>
            </div>

            <div className="tab-content">
                <div className="trade-header-container">
                    <div className="trade-header">
                        <div>Ticket</div>
                        <div>Time</div>
                        <div>Symbol</div>
                        <div>Type</div>
                        <div>Volume</div>
                        <div>Price</div>
                        <div>TP</div>
                        <div>SL</div>
                        <div>Leverage</div>
                        <div>Change%</div>
                        <div>Profit</div>
                    </div>
                </div>

                <div className={activeTab === "trades" ? "trades-list" : "history-list"}>
                    {tradeHistory.length === 0 ? (
                        <div className="no-trades">No trades yet</div>
                    ) : (
                        tradeHistory.map((trade, index) => (
                            <div className="trade-entry" key={index}>
                                <div>{String(trade.ticket).padStart(5, "0")}</div>
                                <div>{trade.time}</div>
                                <div>{trade.symbol}</div>
                                <div className={`trade-type ${trade.isLong ? "buy" : "sell"}`}>
                                    {trade.isLong ? "Buy" : "Sell"}
                                </div>
                                <div>{trade.volume}</div>
                                <div>{trade.price}</div>
                                <div>{trade.tp || "-"}</div>
                                <div>{trade.sl || "-"}</div>
                                <div>{trade.leverage}x</div>
                                <div>{trade.change || "—"}</div>
                                {renderProfitCell(trade.profit)}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default BottomPanel;
