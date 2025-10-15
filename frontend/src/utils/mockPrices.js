// src/utils/mockPrices.js
// Simple singleton mock price stream with a tiny random walk.
// No RPC/wallet usage. Safe for prototypes and UI work.

const KNOWN = [
    "EUR/USD",
    "GBP/USD",
    "JPY/USD",
    "EUR/GBP",
    "EUR/JPY",
    "GBP/JPY",
];

// Baseline spot-ish values (not exact; just plausible)
const state = {
    "EUR/USD": 1.0850,
    "GBP/USD": 1.2700,
    "JPY/USD": 0.0067, // ~ USD/JPY 149 => JPY/USD ≈ 1/149 ≈ 0.0067
    // Crosses will be derived below
};

// Compute crosses from USD legs when possible
function computeCrosses() {
    const eurUsd = state["EUR/USD"];
    const gbpUsd = state["GBP/USD"];
    const jpyUsd = state["JPY/USD"];

    if (eurUsd && gbpUsd && gbpUsd !== 0) {
        state["EUR/GBP"] = eurUsd / gbpUsd;
    }
    if (eurUsd && jpyUsd && jpyUsd !== 0) {
        state["EUR/JPY"] = eurUsd / jpyUsd;
    }
    if (gbpUsd && jpyUsd && jpyUsd !== 0) {
        state["GBP/JPY"] = gbpUsd / jpyUsd;
    }
}
computeCrosses();

// Subscriptions
const subs = new Set();

// Small random walk per tick
function jitter(val) {
    // +/- 0.05% per tick
    const pct = (Math.random() - 0.5) * 0.001; // ±0.05%
    return Math.max(0.00001, val * (1 + pct));
}

// Tick engine
let timer = null;
function start() {
    if (timer) return;
    timer = setInterval(() => {
        // Move only the USD legs, then recompute crosses
        state["EUR/USD"] = jitter(state["EUR/USD"]);
        state["GBP/USD"] = jitter(state["GBP/USD"]);
        state["JPY/USD"] = jitter(state["JPY/USD"]);
        computeCrosses();

        // Broadcast
        const snapshot = { ...state };
        subs.forEach((cb) => {
            try {
                cb(snapshot);
            } catch {
                // ignore subscriber errors
            }
        });
    }, 5000); // update every 5s
}

export function subscribe(callback) {
    if (typeof callback !== "function") return () => { };
    subs.add(callback);
    start();
    // immediate push so UI has values now
    callback({ ...state });
    return () => subs.delete(callback);
}

export function getPrice(symbol) {
    return state[symbol];
}

export function ensureSymbols(symbols = []) {
    // We “know” all our pairs already; this is here if you expand the list later.
    // For unknowns, you could seed from USD legs.
    (symbols || []).forEach((s) => {
        if (!(s in state) && KNOWN.includes(s)) {
            computeCrosses();
        }
    });
}

export const KNOWN_SYMBOLS = KNOWN.slice();
