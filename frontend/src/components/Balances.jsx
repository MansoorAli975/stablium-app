// src/components/Balances.jsx
function Balances({ balances }) {
    return (
        <div className="balances-container">
            <div className="balances-inner">
                <h3 className="balances-heading">Your Balances</h3>
                <div className="balance-boxes vertical">
                    {Object.entries(balances).map(([symbol, amount]) => (
                        <div
                            key={symbol}
                            className="balance-box row"
                            role="listitem"
                            aria-label={`${symbol} balance`}
                        >
                            <span className="balance-symbol">{symbol}</span>
                            <span className="balance-amount">
                                {typeof amount === "number"
                                    ? amount.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 4,
                                    })
                                    : amount}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Balances;
