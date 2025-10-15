// src/components/BottomPanel.jsx
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";
import { toUiSymbol } from "../utils/pairs";
import "../styles.css";

const RPC_URL = import.meta?.env?.VITE_RPC_URL || "";
const DEBUG = true;
const DISPLAY_DP = 5;
const DEFAULT_FEED_DECIMALS = 8;

// ---------- formatters ----------
function fmtTime(ts) {
    if (!ts) return "—";
    const n = Number(ts);
    if (!Number.isFinite(n) || n === 0) return "—";
    try {
        return new Date(n * 1000).toLocaleString();
    } catch {
        return "—";
    }
}
function fmtUsd2_1e18(x) {
    try {
        const s = ethers.formatUnits(x ?? 0n, 18);
        const num = Number(s);
        if (!Number.isFinite(num)) return "—";
        return num.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    } catch {
        return "—";
    }
}
function fmtUsd4_1e18(x) {
    try {
        const s = ethers.formatUnits(x ?? 0n, 18);
        const num = Number(s);
        if (!Number.isFinite(num)) return "—";
        return num.toLocaleString(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        });
    } catch {
        return "—";
    }
}
// Format a 1e18 price using feed decimals (e.g. 8 dp for FX)
function fmtPriceWithDec(price1e18 /*, decIgnored */) {
    try {
        const num = Number(ethers.formatUnits(price1e18 ?? 0n, 18));
        if (!Number.isFinite(num)) return "—";
        return num.toFixed(DISPLAY_DP);
    } catch {
        return "—";
    }
}
function fmtEth18(x) {
    try {
        const s = ethers.formatUnits(x ?? 0n, 18);
        const num = Number(s);
        if (!Number.isFinite(num)) return "—";
        return num.toLocaleString(undefined, {
            minimumFractionDigits: 4,
            maximumFractionDigits: 4,
        });
    } catch {
        return "—";
    }
}

// ---------- math helpers ----------
function scaleTo1e18(feedValueBigInt, feedDecimals) {
    const d = Number(feedDecimals);
    if (d === 18) return feedValueBigInt;
    if (d < 18) return feedValueBigInt * 10n ** BigInt(18 - d);
    return feedValueBigInt / 10n ** BigInt(d - 18);
}
function scaleWithDefaultTo1e18(feedValueBigInt, decMaybe) {
    const d =
        decMaybe === undefined || decMaybe === null
            ? DEFAULT_FEED_DECIMALS
            : Number(decMaybe);
    return scaleTo1e18(feedValueBigInt ?? 0n, d);
}
function pctChange1e4(curr1e18, entry1e18, isLong) {
    if (entry1e18 === 0n) return 0;
    const raw = ((curr1e18 - entry1e18) * 10000n) / entry1e18; // basis points
    return isLong ? Number(raw) : Number(-raw);
}
function pnlUsd1e18(tradeSizeUsd1e18, entry1e18, curr1e18, isLong) {
    if (entry1e18 === 0n) return 0n;
    const delta = curr1e18 - entry1e18;
    const signed = isLong ? delta : -delta;
    return (tradeSizeUsd1e18 * signed) / entry1e18;
}

const FEED_ABI = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

const BottomPanel = ({ tradeHistory = [], refreshTrades }) => {
    const [activeTab, setActiveTab] = useState("trades");
    const [showSample, setShowSample] = useState(false);
    const [feedDecs, setFeedDecs] = useState({}); // { EUR: 8, GBP: 8, ... }
    const [currPrice, setCurrPrice] = useState({}); // { EUR: 1e18n, ... }

    // Preload feed decimals for bases we see in tradeHistory
    useEffect(() => {
        (async () => {
            try {
                const provider = RPC_URL
                    ? new ethers.JsonRpcProvider(RPC_URL)
                    : (typeof window !== "undefined" && window.ethereum
                        ? new ethers.BrowserProvider(window.ethereum)
                        : null);
                if (!provider) return;

                const engine = getForexEngineContract(provider);
                const bases = Array.from(
                    new Set(
                        (tradeHistory || [])
                            .map((p) => String(p.pair || "").toUpperCase())
                            .filter(Boolean)
                    )
                );

                const updates = {};
                for (const base of bases) {
                    if (feedDecs[base] !== undefined) continue;
                    const feedAddr = await engine.getSyntheticPriceFeed(base);
                    if (!feedAddr || feedAddr === ethers.ZeroAddress) continue;
                    const feed = new ethers.Contract(feedAddr, FEED_ABI, provider);
                    const decRaw = await feed.decimals();
                    updates[base] = Number(decRaw);
                }
                if (Object.keys(updates).length) {
                    setFeedDecs((prev) => ({ ...prev, ...updates }));
                }
            } catch (e) {
                console.warn("decimals preload failed:", e?.message || e);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tradeHistory]);

    // Listen for live price updates from Market/App
    useEffect(() => {
        const asBigInt1e18 = (v) => {
            if (typeof v === "bigint") return v;
            if (typeof v === "string") return BigInt(v);
            if (typeof v === "number") return BigInt(Math.trunc(v));
            if (v && typeof v.toString === "function") return BigInt(v.toString());
            return 0n;
        };

        const onPrice = (e) => {
            const { base, quote, price1e18 } = (e && e.detail) || {};
            if (!base || price1e18 == null) return;
            if (String(quote).toUpperCase() !== "USD") return;

            const key = String(base).toUpperCase();
            const normalized = asBigInt1e18(price1e18);
            if (DEBUG)
                console.log("[price:update] accepted", {
                    base: key,
                    price1e18: normalized.toString(),
                });

            setCurrPrice((prev) =>
                prev[key] === normalized ? prev : { ...prev, [key]: normalized }
            );
        };

        window.addEventListener("price:update", onPrice);
        return () => window.removeEventListener("price:update", onPrice);
    }, []);

    // Build rows; History uses exit for "Exit" and shows it with feed decimals
    const filteredRows = useMemo(() => {
        const baseRows = (tradeHistory || [])
            .map((p, idx) => ({
                ...p,
                __index: typeof p.__index === "number" ? p.__index : idx,
            }))
            .filter((p) => (activeTab === "trades" ? p.isOpen : !p.isOpen))
            .sort((a, b) => {
                const ta = Number(a.isOpen ? a.timestamp : a.closeTimestamp);
                const tb = Number(b.isOpen ? b.timestamp : b.closeTimestamp);
                return tb - ta; // newest first
            });

        return baseRows.map((p) => {
            const base = String(p.pair || "").toUpperCase();
            const d = feedDecs[base] ?? DEFAULT_FEED_DECIMALS;

            // Scale all prices to 1e18 so we can format consistently
            const entry1e18 = scaleWithDefaultTo1e18(p.entryPrice ?? 0n, d);
            const exit1e18 = scaleWithDefaultTo1e18(p.exitPrice ?? 0n, d);
            const live1e18 = currPrice[base];

            // For history rows: freeze at exit; for open: use live
            const currentForRow1e18 = p.isOpen ? live1e18 : exit1e18;

            let change = "—";
            let profit = "—";
            let profitClass = "profit neutral";

            if (p.isOpen && live1e18 != null && live1e18 !== undefined) {
                const bps = pctChange1e4(live1e18, entry1e18, Boolean(p.isLong));
                change = `${(bps / 100).toFixed(4)}%`;
                const pnl = pnlUsd1e18(
                    p.tradeSize ?? 0n,
                    entry1e18,
                    live1e18,
                    Boolean(p.isLong)
                );
                profit = fmtUsd4_1e18(pnl);
                profitClass =
                    p.pnl > 0n
                        ? "profit positive"
                        : p.pnl < 0n
                            ? "profit negative"
                            : "profit neutral";
            } else if (!p.isOpen) {
                const realized = p.pnl ?? 0n;
                profit = fmtUsd2_1e18(realized);
                profitClass =
                    realized > 0n
                        ? "profit positive"
                        : realized < 0n
                            ? "profit negative"
                            : "profit neutral";
            }

            // Always show TP/SL if set (> 0), even in history
            const tpSet = (p.takeProfitPrice ?? 0n) > 0n;
            const slSet = (p.stopLossPrice ?? 0n) > 0n;

            return {
                __index: p.__index,
                isOpen: Boolean(p.isOpen),
                isLong: Boolean(p.isLong),
                base,
                d,
                time: fmtTime(p.isOpen ? p.timestamp : p.closeTimestamp),
                symbol: toUiSymbol(base),
                volumeUsd: fmtUsd2_1e18(p.tradeSize),
                marginWeth: fmtEth18(p.marginUsed),
                entryStr: fmtPriceWithDec(entry1e18, d), // Entry
                currentOrExitStr:
                    currentForRow1e18 != null && currentForRow1e18 !== undefined
                        ? fmtPriceWithDec(currentForRow1e18, d) // Live for open, Exit for history
                        : p.isOpen
                            ? "…"
                            : "—",
                tpStr: tpSet
                    ? fmtPriceWithDec(scaleWithDefaultTo1e18(p.takeProfitPrice, d), d)
                    : "—",
                slStr: slSet
                    ? fmtPriceWithDec(scaleWithDefaultTo1e18(p.stopLossPrice, d), d)
                    : "—",
                leverage: Number(p.leverage ?? 0n) || 0,
                change,
                profit,
                profitClass,
            };
        });
    }, [tradeHistory, activeTab, feedDecs, currPrice]);

    const nothingToShow = filteredRows.length === 0 && !showSample;
    const currentColLabel = activeTab === "history" ? "Exit" : "Current";

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
                        <div>Volume (USD)</div>
                        <div>Margin (WETH)</div>
                        <div>Entry</div>
                        <div>{currentColLabel}</div>
                        <div>TP</div>
                        <div>SL</div>
                        <div>Leverage</div>
                        <div>Change%</div>
                        <div>Profit</div>
                        <div />
                    </div>
                </div>

                <div
                    className={activeTab === "trades" ? "trades-list" : "history-list"}
                >
                    {nothingToShow ? (
                        <div className="no-trades" style={{ textAlign: "center" }}>
                            <div style={{ marginBottom: 8 }}>
                                No {activeTab === "trades" ? "open trades" : "history"} yet.
                            </div>
                            <button
                                className="connect-btn"
                                onClick={() => setShowSample(true)}
                            >
                                Show sample row
                            </button>
                        </div>
                    ) : (
                        filteredRows.map((t) => (
                            <div className="trade-entry" key={t.__index}>
                                <div>{String(t.__index).padStart(5, "0")}</div>
                                <div>{t.time}</div>
                                <div>{t.symbol}</div>
                                <div className={`trade-type ${t.isLong ? "buy" : "sell"}`}>
                                    {t.isLong ? "Buy" : "Sell"}
                                </div>
                                <div>{t.volumeUsd}</div>
                                <div>{t.marginWeth}</div>
                                <div>{t.entryStr}</div>
                                <div>{t.currentOrExitStr}</div>
                                <div>{t.tpStr}</div>
                                <div>{t.slStr}</div>
                                <div>{t.leverage}x</div>
                                <div>{t.change}</div>
                                <div className={t.profitClass}>{t.profit}</div>
                                <div
                                    className="actions"
                                    style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
                                >
                                    {activeTab === "trades" && t.isOpen && (
                                        <>
                                            {/* NEW: Modify TP/SL */}
                                            <button
                                                className="modify-btn"
                                                onClick={() => openModifyForRow(t)}
                                                title="Modify TP/SL"
                                            >
                                                Modify
                                            </button>

                                            {/* Existing: Close */}
                                            <button
                                                className="close-btn"
                                                onClick={() => handleClosePosition(t.__index, t.isLong)}
                                                title="Close trade"
                                            >
                                                ✖
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );

    // === helpers (component scope) ===
    function openModifyForRow(row) {
        // We use UI strings for the modal; if no TP/SL set, pass empty strings
        const currentTpUi = row.tpStr && row.tpStr !== "—" ? String(row.tpStr) : "";
        const currentSlUi = row.slStr && row.slStr !== "—" ? String(row.slStr) : "";

        window.dispatchEvent(
            new CustomEvent("tpsl:amend", {
                detail: {
                    positionId: Number(row.__index),
                    baseUiSymbol: row.symbol, // e.g., "EUR/USD"
                    isLong: Boolean(row.isLong),
                    entryUi: String(row.entryStr || ""),
                    feedDecimals: Number(row.d ?? DEFAULT_FEED_DECIMALS),
                    currentTpUi,
                    currentSlUi,
                },
            })
        );
    }

    async function handleClosePosition(onChainIndex, isLong) {
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const contract = getForexEngineContract(signer);

            const guard = isLong ? ethers.MaxUint256 : 0n;
            const idx =
                typeof onChainIndex === "bigint" ? onChainIndex : BigInt(onChainIndex);

            if (DEBUG)
                console.log("[closePosition] simulate", {
                    idx: idx.toString(),
                    guard: guard.toString(),
                    isLong,
                });

            try {
                await contract.closePosition.staticCall(idx, guard);
            } catch (simErr) {
                console.error("[closePosition.staticCall]", simErr);
                alert(
                    `Close (simulation) reverted: ${simErr?.reason || simErr?.message || "Unknown error"
                    }`
                );
                return;
            }

            const tx = await contract.closePosition(idx, guard);
            if (DEBUG) console.log("[closePosition] sent tx:", tx.hash);
            await tx.wait();

            if (typeof refreshTrades === "function") refreshTrades();
            window.dispatchEvent(new CustomEvent("engine:refresh"));
        } catch (err) {
            console.error(`❌ Failed to close position #${onChainIndex}:`, err);
            alert(`Close failed: ${err?.reason || err?.message || "Unknown error"}`);
        }
    }
};

export default BottomPanel;
