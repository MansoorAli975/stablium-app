// src/utils/pairs.js

/**
 * Given a UI symbol like "EUR/USD" or "EUR", return the engine pair key ("EUR").
 * Trims whitespace and uppercases defensively.
 */
export function pairKeyFromUi(uiSymbol) {
    if (!uiSymbol) return "";
    const s = String(uiSymbol).toUpperCase().trim();
    return s.includes("/") ? s.split("/")[0].trim() : s;
}

/**
 * Split a UI symbol to [base, quote]. Defaults quote to "USD" if missing.
 */
export function splitUiSymbol(uiSymbol) {
    if (!uiSymbol) return ["", "USD"];
    const s = String(uiSymbol).toUpperCase().trim();
    if (!s.includes("/")) return [s, "USD"];
    const [base, quote] = s.split("/");
    return [base.trim(), quote.trim()];
}

/**
 * Return true if the UI symbol quotes in USD.
 */
export function isUsdQuote(uiSymbol) {
    const [, quote] = splitUiSymbol(uiSymbol);
    return quote === "USD";
}

/**
 * Convert an engine pair key ("EUR") to a display symbol ("EUR/USD").
 * (We can extend later for non-USD quotes if needed.)
 */
export function toUiSymbol(pairKey) {
    if (!pairKey) return "";
    return `${String(pairKey).toUpperCase().trim()}/USD`;
}
