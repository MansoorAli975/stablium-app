import { useState } from "react";
import "../styles.css";

const BottomPanel = () => {
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

                {activeTab === "trades" ? (
                    <div className="trades-list">
                        <div className="trade-entry">
                            <div>00004</div>
                            <div>16:45</div>
                            <div>EUR/USD</div>
                            <div className="trade-type buy">Buy</div>
                            <div>100</div>
                            <div>1.0967</div>
                            <div>1.1100</div>
                            <div>1.0880</div>
                            <div>5x</div>
                            <div>+0.52%</div>
                            {renderProfitCell("+24.00")}
                        </div>
                        <div className="trade-entry">
                            <div>00003</div>
                            <div>16:38</div>
                            <div>XAU/USD</div>
                            <div className="trade-type sell">Sell</div>
                            <div>50</div>
                            <div>2365.90</div>
                            <div>2330.00</div>
                            <div>2380.00</div>
                            <div>3x</div>
                            <div>-1.12%</div>
                            {renderProfitCell("-18.50")}
                        </div>
                    </div>
                ) : (
                    <div className="history-list">
                        <div className="trade-entry">
                            <div>00002</div>
                            <div>15:22</div>
                            <div>EUR/USD</div>
                            <div className="trade-type sell">Sell</div>
                            <div>120</div>
                            <div>1.0982</div>
                            <div>1.0800</div>
                            <div>1.1020</div>
                            <div>2x</div>
                            <div>+0.72%</div>
                            {renderProfitCell("+32.00")}
                        </div>
                        <div className="trade-entry">
                            <div>00001</div>
                            <div>15:00</div>
                            <div>GBP/USD</div>
                            <div className="trade-type buy">Buy</div>
                            <div>80</div>
                            <div>1.2745</div>
                            <div>1.2850</div>
                            <div>1.2680</div>
                            <div>4x</div>
                            <div>-0.48%</div>
                            {renderProfitCell("-18.00")}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BottomPanel;