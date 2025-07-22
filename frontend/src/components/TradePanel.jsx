import React, { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";

const TradePanel = ({
    forexPrice,
    asset = "WETH",
    selectedSymbol,
    balances,
    setBalances,
    tradeHistory,
    setTradeHistory,
}) => {
    const [tradeAmount, setTradeAmount] = useState("");
    const [selectedLeverage, setSelectedLeverage] = useState(1);
    const [tp, setTp] = useState("");
    const [sl, setSl] = useState("");
    const inputRef = useRef(null);

    const syntheticToken = `s${selectedSymbol.split("/")[0]}`;
    const baseToken = asset;

    const handleTrade = async (isLong) => {
        const amount = parseFloat(tradeAmount);
        if (isNaN(amount) || amount <= 0) return alert("Enter valid amount");

        const price = parseFloat(isLong ? forexPrice?.ask : forexPrice?.bid);
        if (!price) return alert("Price unavailable");

        const marginAmount = ethers.parseUnits(tradeAmount.toString(), 18);
        const leverage = selectedLeverage;
        const takeProfit = tp ? ethers.parseUnits(tp.toString(), 18) : 0;
        const stopLoss = sl ? ethers.parseUnits(sl.toString(), 18) : 0;

        try {
            // Ensure wallet connection
            await window.ethereum.request({ method: "eth_requestAccounts" });

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = getForexEngineContract(signer);

            const tx = await contract.openPosition(
                selectedSymbol,
                isLong,
                marginAmount,
                leverage,
                takeProfit,
                stopLoss
            );

            console.log("📤 TX sent:", tx.hash);
            await tx.wait();
            alert("✅ Trade submitted!");

            setTradeAmount("");
            setTp("");
            setSl("");
        } catch (err) {
            console.error("❌ Trade failed:", err);
            alert("Trade failed. Check console for details.");
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            handleTrade(true);
        }
    };

    useEffect(() => {
        if (inputRef.current) {
            inputRef.current.focus();
        }
    }, [selectedSymbol]);

    return (
        <>
            <div className="trade-panel compact">
                <div className="trade-panel-body">
                    <label className="trade-label">
                        Amount ({syntheticToken}):
                        <input
                            type="number"
                            ref={inputRef}
                            className="trade-input"
                            value={tradeAmount}
                            onChange={(e) => setTradeAmount(e.target.value)}
                            onKeyDown={handleKeyPress}
                            step="0.01"
                            min="0.01"
                            placeholder="Amount"
                        />
                    </label>

                    <label className="trade-label">
                        Take Profit (optional):
                        <input
                            type="number"
                            className="trade-input"
                            value={tp}
                            onChange={(e) => setTp(e.target.value)}
                            placeholder="TP Price"
                        />
                    </label>

                    <label className="trade-label">
                        Stop Loss (optional):
                        <input
                            type="number"
                            className="trade-input"
                            value={sl}
                            onChange={(e) => setSl(e.target.value)}
                            placeholder="SL Price"
                        />
                    </label>

                    <div className="trade-actions">
                        <button className="buy-btn" onClick={() => handleTrade(true)}>
                            Buy
                        </button>
                        <button className="sell-btn" onClick={() => handleTrade(false)}>
                            Sell
                        </button>
                    </div>
                </div>
            </div>

            <div className="leverage-selector">
                <label className="trade-label">
                    Leverage:
                    <select
                        className="leverage-select"
                        value={selectedLeverage}
                        onChange={(e) => setSelectedLeverage(parseInt(e.target.value))}
                    >
                        <option value={1}>1x</option>
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                    </select>
                </label>
            </div>
        </>
    );
};

export default TradePanel;
