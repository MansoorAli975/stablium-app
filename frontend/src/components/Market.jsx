// src/components/Market.jsx
import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";

const RPC_URL = import.meta?.env?.VITE_RPC_URL || "";
const DEBUG = true;

// DEBUG: confirm env + engine address at runtime
if (typeof window !== "undefined") {
    console.log("[Market] VITE_ENGINE_ADDRESS:", import.meta.env.VITE_ENGINE_ADDRESS);
    console.log("[Market] VITE_RPC_URL:", import.meta.env.VITE_RPC_URL);
}

// ---------- format helpers ----------
function fmt(num, decimals = 5) {
    if (num == null || Number.isNaN(num)) return "—";
    return Number(num).toFixed(decimals);
}

// 1e18 fixed-point helpers
const ONE = 10n ** 18n;
const div1e18 = (a1e18, b1e18) => (b1e18 === 0n ? 0n : (a1e18 * ONE) / b1e18);
const toNum1e18 = (x) => {
    try {
        return Number(ethers.formatUnits(x ?? 0n, 18));
    } catch {
        return NaN;
    }
};

// map UI symbol → base currency code used by engine
const BASE_FROM_PAIR = {
    "EUR/USD": "EUR",
    "GBP/USD": "GBP",
    "JPY/USD": "JPY",
    "EUR/GBP": "EUR",
    "EUR/JPY": "EUR",
    "GBP/JPY": "GBP",
};

export default function Market() {
    const [lastUpdated, setLastUpdated] = useState(null);
    const [selectedPair, setSelectedPair] = useState("EUR/USD"); // visual selection

    // previous raw 1e18 values for trend detection
    const prevMapRef = useRef(new Map()); // key -> BigInt

    const [rows, setRows] = useState([
        { key: "EUR/USD", price: "—", trend: "flat" },
        { key: "GBP/USD", price: "—", trend: "flat" },
        { key: "JPY/USD", price: "—", trend: "flat" },
        { key: "EUR/GBP", price: "—", trend: "flat" },
        { key: "EUR/JPY", price: "—", trend: "flat" },
        { key: "GBP/JPY", price: "—", trend: "flat" },
    ]);

    useEffect(() => {
        let stop = false;

        const provider = RPC_URL
            ? new ethers.JsonRpcProvider(RPC_URL)
            : (typeof window !== "undefined" && window.ethereum
                ? new ethers.BrowserProvider(window.ethereum)
                : null);

        if (!provider) {
            console.warn("[Market] No provider available.");
            return;
        }

        const engine = getForexEngineContract(provider);

        async function pollOnce() {
            try {
                // Read on-chain USD quotes (1e18)
                const [eurUsd1e18, gbpUsd1e18, jpyUsd1e18] = await Promise.all([
                    engine.getDerivedPrice("EUR", "USD"),
                    engine.getDerivedPrice("GBP", "USD"),
                    engine.getDerivedPrice("JPY", "USD"),
                ]);

                if (DEBUG) {
                    console.log("[Market] polled engine 1e18 quotes:", {
                        eurUsd1e18: eurUsd1e18?.toString?.() ?? String(eurUsd1e18),
                        gbpUsd1e18: gbpUsd1e18?.toString?.() ?? String(gbpUsd1e18),
                        jpyUsd1e18: jpyUsd1e18?.toString?.() ?? String(jpyUsd1e18),
                    });
                }

                // Derive crosses (all 1e18)
                const eurGbp1e18 = div1e18(eurUsd1e18, gbpUsd1e18);
                const eurJpy1e18 = div1e18(eurUsd1e18, jpyUsd1e18);
                const gbpJpy1e18 = div1e18(gbpUsd1e18, jpyUsd1e18);

                // Map of raw values for trend comparison
                const rawNow = new Map([
                    ["EUR/USD", eurUsd1e18],
                    ["GBP/USD", gbpUsd1e18],
                    ["JPY/USD", jpyUsd1e18],
                    ["EUR/GBP", eurGbp1e18],
                    ["EUR/JPY", eurJpy1e18],
                    ["GBP/JPY", gbpJpy1e18],
                ]);

                // Build rows with trend decisions
                const nextRows = [
                    { key: "EUR/USD", num: toNum1e18(eurUsd1e18), dp: 5 },
                    { key: "GBP/USD", num: toNum1e18(gbpUsd1e18), dp: 5 },
                    { key: "JPY/USD", num: toNum1e18(jpyUsd1e18), dp: 5 },
                    { key: "EUR/GBP", num: toNum1e18(eurGbp1e18), dp: 5 },
                    { key: "EUR/JPY", num: toNum1e18(eurJpy1e18), dp: 5 },
                    { key: "GBP/JPY", num: toNum1e18(gbpJpy1e18), dp: 5 },
                ].map(({ key, num, dp }) => {
                    const prevRaw = prevMapRef.current.get(key);
                    const currRaw = rawNow.get(key);
                    let trend = "flat";
                    if (prevRaw != null) {
                        if (currRaw > prevRaw) trend = "up";
                        else if (currRaw < prevRaw) trend = "down";
                    }
                    return { key, price: fmt(num, dp), trend };
                });

                // Save current raw values for next tick
                prevMapRef.current = rawNow;

                // Update UI
                setRows(nextRows);
                setLastUpdated(new Date());

                // Broadcast USD quotes so BottomPanel consumes identical BigInts
                window.dispatchEvent(
                    new CustomEvent("price:update", { detail: { base: "EUR", quote: "USD", price1e18: eurUsd1e18 } })
                );
                window.dispatchEvent(
                    new CustomEvent("price:update", { detail: { base: "GBP", quote: "USD", price1e18: gbpUsd1e18 } })
                );
                window.dispatchEvent(
                    new CustomEvent("price:update", { detail: { base: "JPY", quote: "USD", price1e18: jpyUsd1e18 } })
                );
            } catch (err) {
                console.error("[Market poll] failed:", err);
            }
        }

        // Poll cadence
        const SECONDS = 20;
        pollOnce(); // immediate
        const id = setInterval(() => !stop && pollOnce(), SECONDS * 1000);
        return () => {
            stop = true;
            clearInterval(id);
        };
    }, [RPC_URL]);

    // Clicking a row selects the pair + broadcasts `pair:select` to the app
    function handleSelectPair(pairKey) {
        setSelectedPair(pairKey);
        const base = BASE_FROM_PAIR[pairKey] || "EUR";
        if (DEBUG) console.log("[Market] pair:select ->", { pairKey, base });
        window.dispatchEvent(new CustomEvent("pair:select", { detail: { pairKey, base } }));
    }

    return (
        <div className="market-section">
            <div className="market-heading">Market</div>

            <div style={{ fontSize: ".8rem", color: "#9aa", marginBottom: ".3rem" }}>
                {lastUpdated ? `last updated: ${lastUpdated.toLocaleTimeString()}` : "—"}
            </div>

            <div className="market-list">
                {rows.map((r) => {
                    const isSel = r.key === selectedPair;
                    return (
                        <div
                            key={r.key}
                            className={`market-row ${isSel ? "selected" : ""}`}
                            onClick={() => handleSelectPair(r.key)}
                            style={{ cursor: "pointer", userSelect: "none" }}
                            title={`Select ${r.key} for trading`}
                        >
                            <div className="market-symbol">{r.key}</div>
                            <div className="market-price" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <span>{r.price}</span>
                                {r.trend === "up" && <span className="trend-up" title="up">▲</span>}
                                {r.trend === "down" && <span className="trend-down" title="down">▼</span>}
                                {r.trend === "flat" && <span className="trend-flat" title="no change">•</span>}
                            </div>
                        </div>
                    );
                })}
            </div>

            <style>
                {`
          .market-row.selected {
            background: rgba(100, 150, 255, 0.08);
            border-radius: 8px;
          }
        `}
            </style>
        </div>
    );
}
