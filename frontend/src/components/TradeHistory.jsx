function TradeHistory({ history }) {
    return (
        <div className="trade-history-container">
            <h3 className="balances-heading">Trade History</h3>
            <div className="trade-history-list">
                {history.length === 0 ? (
                    <p style={{ color: "#bbb" }}>No trades yet.</p>
                ) : (
                    history.map((trade, index) => (
                        <div key={index} className="balance-box row">
                            <span>{trade.time}</span>
                            <span style={{ color: trade.type === "BUY" ? "#00FFAA" : "#FF7777" }}>
                                {trade.type}
                            </span>
                            <span>{trade.symbol}</span>
                            <span>{trade.amount}</span>
                            <span>@ {trade.price}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export default TradeHistory;
