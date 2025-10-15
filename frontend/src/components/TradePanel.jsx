// src/components/TradePanel.jsx
import React, { useState, useRef, useEffect } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";
import { splitUiSymbol } from "../utils/pairs";
import { toFeedUnits, to1e18, validateTpSl } from "../utils/tpsl";

const FEED_ABI = [
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
    "function decimals() view returns (uint8)"
];
const DEBUG = true;

// (No tick snapping; we validate by basis points vs entry)
const MAX_SLIPPAGE_BPS = 0; // “exactly what user typed” entry guard
const fmt = (n, d) => Number(ethers.formatUnits(n, d)).toFixed(5);

export default function TradePanel({
    forexPrice,
    asset = "WETH",
    selectedSymbol,
    balances,
    setBalances,
    tradeHistory,
    setTradeHistory,
    signer,
    userAddress,
}) {
    const [tradeAmount, setTradeAmount] = useState("");
    const [selectedLeverage, setSelectedLeverage] = useState(1);
    const [tp, setTp] = useState("");
    const [sl, setSl] = useState("");
    const inputRef = useRef(null);

    // ===== Follow Market.jsx `pair:select` events =====
    const [selectedBase, setSelectedBase] = useState(null);
    useEffect(() => {
        function onPairSelect(e) {
            const { base } = (e && e.detail) || {};
            if (!base) return;
            const b = String(base).toUpperCase();
            setSelectedBase(b);
            console.log("[TradePanel] pair selected:", b);
        }
        window.addEventListener("pair:select", onPairSelect);
        return () => window.removeEventListener("pair:select", onPairSelect);
    }, []);
    // Resolve active base from event OR prop
    const fallbackBase = (splitUiSymbol(selectedSymbol || "EUR/USD")[0] || "EUR").toUpperCase();
    const baseToken = (selectedBase || fallbackBase).toUpperCase();
    const quoteToken = "USD"; // engine uses USD as quote
    const syntheticToken = `s${baseToken}`;
    // ==================================================

    const handleTrade = async (isLong) => {
        const amount = parseFloat(tradeAmount);
        if (isNaN(amount) || amount <= 0) return alert("Enter a valid margin amount (WETH).");
        if (!signer) return alert("Wallet not connected.");

        try {
            const engine = getForexEngineContract(signer);

            // IMPORTANT: use the active base from click OR prop
            const pairKey = baseToken; // engine expects base symbol like "EUR" / "GBP" / "JPY"

            // quick engine reads
            const [paused, breaker, maxLev] = await Promise.all([
                engine.isContractPaused(),
                engine.isCircuitBreakerTriggered(),
                engine.MAX_LEVERAGE(),
            ]);

            if (paused) return alert("Trading is paused by admin.");
            if (breaker) return alert("Circuit breaker is active. Try later.");
            if (selectedLeverage > Number(maxLev)) {
                return alert(`Leverage too high. Max = ${String(maxLev)}x`);
            }

            // Feed + decimals + ENTRY (match contract’s reference)
            const feedAddr = await engine.getSyntheticPriceFeed(pairKey);
            if (!feedAddr || feedAddr === ethers.ZeroAddress) {
                return alert(`No price feed configured for ${pairKey}.`);
            }
            const feed = new ethers.Contract(feedAddr, FEED_ABI, signer);
            const [, entryRaw, , updatedAt] = await feed.latestRoundData();
            if (!updatedAt) return alert("No oracle price");
            const feedDecimals = await feed.decimals();

            // entry/current in 1e18 for validation math
            const entry1e18 = to1e18(BigInt(entryRaw), feedDecimals);

            // parse TP/SL (optional)
            const hasTP = tp !== "" && tp != null;
            const hasSL = sl !== "" && sl != null;

            const tpFeed = hasTP ? toFeedUnits(String(tp), feedDecimals) : 0n;
            const slFeed = hasSL ? toFeedUnits(String(sl), feedDecimals) : 0n;

            const tp1e18 = tpFeed > 0n ? to1e18(tpFeed, feedDecimals) : 0n;
            const sl1e18 = slFeed > 0n ? to1e18(slFeed, feedDecimals) : 0n;

            // read min-move bps (fallback 5)
            let minMove = 5;
            try { minMove = Number(await engine.MIN_PRICE_MOVEMENT()); } catch { }

            // validate by basis points vs entry (same rules as contract)
            const v = validateTpSl({
                isLong,
                entry1e18,
                tp1e18,
                sl1e18,
                MIN_PRICE_MOVEMENT_BPS: minMove
            });
            if (!v.ok) {
                return alert(v.errors.join("\n"));
            }

            // args
            const marginAmount = ethers.parseUnits(String(amount), 18);
            const leverage = selectedLeverage;

            if (DEBUG) {
                console.log("[OPEN args]", {
                    pairKey, // base (EUR/GBP/JPY)
                    isLong,
                    marginAmount: marginAmount.toString(),
                    leverage,
                    tp: hasTP ? tpFeed.toString() : "0",
                    sl: hasSL ? slFeed.toString() : "0",
                    maxSlippageBps: MAX_SLIPPAGE_BPS,
                });
            }

            const args = [
                pairKey,
                isLong,
                marginAmount,
                leverage,
                tpFeed,
                slFeed,
                MAX_SLIPPAGE_BPS,
            ];

            // ---- PRE-FLIGHT: static call + error decode ----
            try {
                await engine.openPosition.staticCall(...args);
            } catch (e) {
                // Try to decode custom error using the engine ABI
                let decoded = null;
                try {
                    decoded = engine.interface.parseError(e?.data || e?.error?.data || e);
                } catch { }
                if (!decoded && e?.data?.data) {
                    try { decoded = engine.interface.parseError(e.data.data); } catch { }
                }

                if (decoded) {
                    const name = decoded?.name || "CustomError";
                    const a = decoded?.args ? JSON.stringify(decoded.args, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : "";
                    console.error("[openPosition.staticCall failed]", name, decoded?.args);
                    let hint = "";
                    if (/Insufficient/i.test(name)) hint = "Check deposited collateral and required initial margin.";
                    else if (/StalePrice/i.test(name)) hint = "Feed is stale — run your price pusher (oracle) so quotes are fresh.";
                    else if (/Slippage/i.test(name)) hint = "Slippage guard hit.";
                    else if (/InvalidTpSl/i.test(name)) hint = "Adjust TP/SL direction and/or distance.";
                    else if (/Paused/i.test(name)) hint = "Engine is paused.";
                    else if (/CircuitBreaker/i.test(name)) hint = "Circuit breaker is active.";

                    return alert(`Open (simulation) reverted:\n• ${name}${a ? ` ${a}` : ""}\n${hint ? `\nHint: ${hint}` : ""}`);
                }

                const selector = (e?.data || e?.error?.data || "").slice(0, 10);
                console.error("[openPosition.staticCall failed]", e);
                return alert(`Open (simulation) reverted.\nSelector: ${selector || "unknown"}\nSee console for details.`);
            }

            // ---- Real tx (only if simulation passed) ----
            let tx;
            try {
                tx = await engine.openPosition(...args);
            } catch (sendErr) {
                let decoded = null;
                try { decoded = engine.interface.parseError(sendErr?.data || sendErr?.error?.data || sendErr); } catch { }
                if (!decoded && sendErr?.data?.data) {
                    try { decoded = engine.interface.parseError(sendErr.data.data); } catch { }
                }
                if (decoded) {
                    const name = decoded?.name || "CustomError";
                    const a = decoded?.args ? JSON.stringify(decoded.args, (_, v) => (typeof v === "bigint" ? v.toString() : v)) : "";
                    console.error("[openPosition failed]", name, decoded?.args);
                    return alert(`Open failed:\n• ${name}${a ? ` ${a}` : ""}`);
                }
                console.error("[openPosition failed]", sendErr);
                return alert(`Open failed: ${sendErr?.reason || sendErr?.message || String(sendErr)}`);
            }

            console.log("TX sent:", tx.hash);
            await tx.wait();
            window.dispatchEvent(new CustomEvent("engine:refresh"));
            alert("Trade submitted!");

            setTradeAmount("");
            setTp("");
            setSl("");
        } catch (err) {
            console.error("Trade failed (outer):", err);
            alert(`Trade failed: ${err?.reason || err?.message || String(err)}`);
        }
    };

    const handleKeyPress = (e) => {
        if (e.key === "Enter") handleTrade(true);
    };

    useEffect(() => {
        inputRef.current?.focus();
    }, [selectedSymbol, selectedBase]); // re-focus if either changes

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
                            placeholder="Margin in WETH (e.g. 0.01)"
                        />
                    </label>

                    <label className="trade-label">
                        Take Profit (optional):
                        <input
                            type="number"
                            className="trade-input"
                            value={tp}
                            onChange={(e) => setTp(e.target.value)}
                            placeholder={`TP Price (${baseToken}/${quoteToken})`}
                        />
                    </label>

                    <label className="trade-label">
                        Stop Loss (optional):
                        <input
                            type="number"
                            className="trade-input"
                            value={sl}
                            onChange={(e) => setSl(e.target.value)}
                            placeholder={`SL Price (${baseToken}/${quoteToken})`}
                        />
                    </label>

                    <div style={{ fontSize: ".85rem", color: "#8aa", margin: "4px 0 10px" }}>
                        Trading pair: <strong>{baseToken}/{quoteToken}</strong>
                    </div>

                    <div className="trade-actions">
                        <button className="buy-btn" onClick={() => handleTrade(true)}>Buy</button>
                        <button className="sell-btn" onClick={() => handleTrade(false)}>Sell</button>
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
                        <option value={4}>4x</option>
                        <option value={5}>5x</option>
                    </select>
                </label>
            </div>
        </>
    );
}
