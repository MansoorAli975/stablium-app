// src/components/AmendTpSl.jsx
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import { getForexEngineContract } from "../utils/contract";
import { splitUiSymbol } from "../utils/pairs";
import { toFeedUnits, to1e18, validateTpSl } from "../utils/tpsl";

const FEED_ABI = [
    "function decimals() view returns (uint8)",
    "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

export default function AmendTpSl() {
    const [open, setOpen] = useState(false);

    const [positionId, setPositionId] = useState(null);
    const [baseUiSymbol, setBaseUiSymbol] = useState("");
    const [isLong, setIsLong] = useState(null);
    const [entryUi, setEntryUi] = useState("");

    const [feedDecimals, setFeedDecimals] = useState(undefined);
    const [minMoveBps, setMinMoveBps] = useState(5); // fallback if chain read fails

    const [tpUi, setTpUi] = useState("");
    const [slUi, setSlUi] = useState("");
    const [origTpUi, setOrigTpUi] = useState("");
    const [origSlUi, setOrigSlUi] = useState("");

    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const reset = useCallback(() => {
        setOpen(false);
        setPositionId(null);
        setBaseUiSymbol("");
        setIsLong(null);
        setEntryUi("");
        setFeedDecimals(undefined);
        setMinMoveBps(5);
        setTpUi("");
        setSlUi("");
        setOrigTpUi("");
        setOrigSlUi("");
        setStatus("");
        setError("");
        setBusy(false);
    }, []);

    // Open modal / seed fields
    useEffect(() => {
        const onOpen = async (ev) => {
            const d = ev.detail || {};
            setPositionId(d.positionId ?? null);
            setBaseUiSymbol(d.baseUiSymbol ?? "");
            setIsLong(!!d.isLong);
            setEntryUi(d.entryUi ?? "");

            // seed editable fields
            setTpUi(d.currentTpUi ?? "");
            setSlUi(d.currentSlUi ?? "");
            setOrigTpUi(d.currentTpUi ?? "");
            setOrigSlUi(d.currentSlUi ?? "");

            // decimals if provided, else we’ll fetch
            if (typeof d.feedDecimals === "number") {
                setFeedDecimals(d.feedDecimals);
            } else {
                setFeedDecimals(undefined);
            }

            setError("");
            setStatus("");
            setOpen(true);

            // Fetch chain params (MIN_PRICE_MOVEMENT_BPS + decimals if missing)
            try {
                let provider = null;
                if (typeof window !== "undefined" && window.ethereum) {
                    provider = new ethers.BrowserProvider(window.ethereum);
                } else {
                    // Fallback read-only if needed (let provider be null if none)
                    const RPC_URL = import.meta?.env?.VITE_RPC_URL || "";
                    if (RPC_URL) provider = new ethers.JsonRpcProvider(RPC_URL);
                }
                if (!provider) return;

                const eng = getForexEngineContract(provider);

                // MIN_PRICE_MOVEMENT_BPS
                try {
                    const m = await eng.MIN_PRICE_MOVEMENT_BPS();
                    setMinMoveBps(Number(m));
                } catch {
                    // keep default 5 if constant not exposed
                }

                // feed decimals if missing
                if (typeof d.feedDecimals !== "number") {
                    const [base] = splitUiSymbol(d.baseUiSymbol ?? "");
                    if (base) {
                        try {
                            const feedAddr = await eng.getSyntheticPriceFeed(
                                String(base).toUpperCase()
                            );
                            if (feedAddr && feedAddr !== ethers.ZeroAddress) {
                                const feed = new ethers.Contract(feedAddr, FEED_ABI, provider);
                                const dec = await feed.decimals();
                                setFeedDecimals(Number(dec));
                            }
                        } catch {
                            /* ignore; we’ll fall back */
                        }
                    }
                }
            } catch (e) {
                console.warn("amend modal: init reads failed:", e?.message || e);
            }
        };
        window.addEventListener("tpsl:amend", onOpen);
        return () => window.removeEventListener("tpsl:amend", onOpen);
    }, []);

    // Basic numeric sanitizer (allows one dot)
    const sanitize = (s) => {
        if (typeof s !== "string") s = String(s ?? "");
        const cleaned = s.replace(/[^0-9.]/g, "");
        const parts = cleaned.split(".");
        if (parts.length > 2) {
            return parts[0] + "." + parts.slice(1).join("").replace(/\./g, "");
        }
        return cleaned;
    };

    const onSubmit = async (e) => {
        e?.preventDefault?.();
        setError("");
        setStatus("");

        try {
            if (positionId == null) throw new Error("Missing position ID.");
            if (!baseUiSymbol) throw new Error("Missing symbol.");
            if (feedDecimals == null) throw new Error("Missing feed decimals.");

            // Require at least one change
            const tpTrim = (tpUi || "").trim();
            const slTrim = (slUi || "").trim();
            if (!tpTrim && !slTrim) {
                throw new Error("Enter a new TP and/or SL.");
            }
            if (tpTrim === origTpUi && slTrim === origSlUi) {
                throw new Error("No changes detected.");
            }

            // Build feed-unit values (keep existing if left blank)
            const finalTpUi = tpTrim || origTpUi || "";
            const finalSlUi = slTrim || origSlUi || "";

            // Convert to feed units (BigInt). If still blank, treat as 0 (clear).
            const tpFeed = finalTpUi ? toFeedUnits(finalTpUi, feedDecimals) : 0n;
            const slFeed = finalSlUi ? toFeedUnits(finalSlUi, feedDecimals) : 0n;

            // Validate against entry using your helper (contract also enforces)
            // Convert entry (UI) -> feed units -> 1e18
            const entryFeed = toFeedUnits(String(entryUi || "0"), feedDecimals);
            const entry1e18 = to1e18(entryFeed, feedDecimals);
            const tp1e18 = tpFeed ? to1e18(tpFeed, feedDecimals) : 0n;
            const sl1e18 = slFeed ? to1e18(slFeed, feedDecimals) : 0n;

            const v = validateTpSl({
                isLong: !!isLong,
                entry1e18,
                tp1e18,
                sl1e18,
                MIN_PRICE_MOVEMENT_BPS: Number(minMoveBps) || 5,
            });
            if (!v.ok) {
                throw new Error(v.reason || "TP/SL validation failed.");
            }

            // Get signer + engine
            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();
            const eng = getForexEngineContract(signer);

            // Find a supported method name
            const candidates = ["setTpSl", "amendTpSl", "modifyTpSl", "updateTpSl"];
            let fn = null;
            for (const name of candidates) {
                if (typeof eng[name] === "function") {
                    fn = name;
                    break;
                }
            }
            if (!fn) {
                throw new Error(
                    "Engine does not expose a TP/SL modify method (e.g., setTpSl). We can add it next."
                );
            }

            setBusy(true);
            setStatus("Simulating…");

            // Preflight
            try {
                await eng[fn].staticCall(
                    BigInt(positionId),
                    tpFeed, // 0 means clear if contract supports it
                    slFeed
                );
            } catch (simErr) {
                console.error("[Modify TP/SL staticCall]", simErr);
                const msg =
                    simErr?.reason ||
                    simErr?.shortMessage ||
                    simErr?.message ||
                    "Simulation reverted.";
                throw new Error(`Simulation reverted: ${msg}`);
            }

            setStatus("Submitting…");
            const tx = await eng[fn](BigInt(positionId), tpFeed, slFeed);
            setStatus(`Sent: ${tx.hash}`);
            await tx.wait();

            setStatus("Success ✅");
            // Refresh tables/UI
            window.dispatchEvent(new CustomEvent("engine:refresh"));
            window.dispatchEvent(
                new CustomEvent("tpsl:amend:success", {
                    detail: {
                        positionId,
                        tpUi: finalTpUi || "",
                        slUi: finalSlUi || "",
                    },
                })
            );

            // Close after a short delay
            setTimeout(() => setOpen(false), 600);
        } catch (err) {
            console.error(err);
            setError(err?.message || "Modify failed.");
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div
            aria-modal="true"
            role="dialog"
            className="tpsl-modal"
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 1000,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "16px",
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !busy) setOpen(false);
            }}
        >
            <div
                className="tpsl-card"
                style={{
                    background: "#111",
                    color: "#eee",
                    width: "100%",
                    maxWidth: 520,
                    borderRadius: 12,
                    padding: 16,
                    boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
                    border: "1px solid #333",
                }}
            >
                <div
                    className="tpsl-title"
                    style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
                >
                    <h3 style={{ margin: 0 }}>
                        Modify TP/SL —{" "}
                        <span style={{ opacity: 0.8 }}>{baseUiSymbol}</span>
                    </h3>
                    <button
                        onClick={() => (!busy ? setOpen(false) : null)}
                        aria-label="Close"
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "#aaa",
                            cursor: busy ? "not-allowed" : "pointer",
                            fontSize: 18,
                        }}
                        disabled={busy}
                    >
                        ✕
                    </button>
                </div>

                <div
                    className="tpsl-meta"
                    style={{
                        marginTop: 10,
                        padding: 10,
                        borderRadius: 8,
                        background: "#181818",
                        border: "1px solid #2a2a2a",
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        fontSize: 14,
                    }}
                >
                    <div>
                        <div style={{ opacity: 0.7 }}>Position ID</div>
                        <div style={{ fontWeight: 600 }}>#{positionId}</div>
                    </div>
                    <div>
                        <div style={{ opacity: 0.7 }}>Side</div>
                        <div style={{ fontWeight: 600 }}>{isLong ? "Long" : "Short"}</div>
                    </div>
                    <div>
                        <div style={{ opacity: 0.7 }}>Entry</div>
                        <div style={{ fontWeight: 600 }}>{entryUi || "—"}</div>
                    </div>
                    <div>
                        <div style={{ opacity: 0.7 }}>Feed Decimals</div>
                        <div style={{ fontWeight: 600 }}>
                            {typeof feedDecimals === "number" ? feedDecimals : "…"}
                        </div>
                    </div>
                    <div>
                        <div style={{ opacity: 0.7 }}>Min Distance</div>
                        <div style={{ fontWeight: 600 }}>{minMoveBps} bps</div>
                    </div>
                </div>

                <form onSubmit={onSubmit} style={{ marginTop: 14 }}>
                    <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                        Take Profit (TP)
                    </label>
                    <input
                        inputMode="decimal"
                        placeholder={entryUi || "e.g. 1.08500"}
                        value={tpUi}
                        onChange={(e) => setTpUi(sanitize(e.target.value))}
                        disabled={busy}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#141414",
                            color: "#eee",
                            border: "1px solid #2a2a2a",
                            marginBottom: 12,
                            fontFamily: "inherit",
                            fontSize: 16,
                        }}
                    />

                    <label style={{ display: "block", marginBottom: 8, fontSize: 14 }}>
                        Stop Loss (SL)
                    </label>
                    <input
                        inputMode="decimal"
                        placeholder={entryUi || "e.g. 1.08680"}
                        value={slUi}
                        onChange={(e) => setSlUi(sanitize(e.target.value))}
                        disabled={busy}
                        style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 8,
                            background: "#141414",
                            color: "#eee",
                            border: "1px solid #2a2a2a",
                            marginBottom: 16,
                            fontFamily: "inherit",
                            fontSize: 16,
                        }}
                    />

                    {status && (
                        <div
                            style={{
                                background: "#172a1a",
                                border: "1px solid #244a29",
                                color: "#b6f0c2",
                                padding: 8,
                                borderRadius: 6,
                                marginBottom: 10,
                                fontSize: 13,
                            }}
                        >
                            {status}
                        </div>
                    )}

                    {error && (
                        <div
                            style={{
                                background: "#3a1313",
                                border: "1px solid #642a2a",
                                color: "#ffb3b3",
                                padding: 8,
                                borderRadius: 6,
                                marginBottom: 12,
                                fontSize: 14,
                            }}
                        >
                            {error}
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            gap: 10,
                            justifyContent: "flex-end",
                            alignItems: "center",
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => (!busy ? reset() : null)}
                            disabled={busy}
                            style={{
                                background: "transparent",
                                color: "#bbb",
                                border: "1px solid #333",
                                padding: "10px 14px",
                                borderRadius: 8,
                                cursor: busy ? "not-allowed" : "pointer",
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={busy || feedDecimals == null}
                            style={{
                                background: busy ? "#444" : "#1f6feb",
                                color: "white",
                                border: "none",
                                padding: "10px 14px",
                                borderRadius: 8,
                                cursor: busy ? "not-allowed" : "pointer",
                                minWidth: 120,
                                fontWeight: 600,
                            }}
                        >
                            {busy ? "Submitting…" : "Modify"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
