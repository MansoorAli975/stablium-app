import React from "react";

const KNOWN_ROWS = ["WETH"]; // grow later if you add more collateral tokens

const Balances = ({ balances = {} }) => {
    return (
        <div className="balances-card">
            <div className="balances-title">Your Balances</div>
            <div className="balances-list">
                {KNOWN_ROWS.map((sym) => (
                    <div className="balance-row" key={sym}>
                        <div className="balance-sym">{sym}</div>
                        <div className="balance-val">{balances[sym] ?? "0"}</div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Balances;
