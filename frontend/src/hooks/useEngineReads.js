// src/hooks/useEngineReads.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getDefaultProvider, getForexEngineContract } from "../utils/contract";

/**
 * Reads all positions via getAllUserPositions(user) and returns clean JS objects.
 * Cross-checks open/closed state using getOpenPositionIds(user, pair) so the UI
 * doesn’t get stuck showing a closed position as open.
 */
export function useEngineReads(userAddress, signerOrProvider) {
    const [positions, setPositions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const pollRef = useRef(null);
    const mounted = useRef(true);

    const conn = useMemo(
        () => signerOrProvider ?? getDefaultProvider(),
        [signerOrProvider]
    );
    const engine = useMemo(() => getForexEngineContract(conn), [conn]);

    const fetchPositions = useCallback(async () => {
        if (!userAddress) {
            setPositions([]);
            return;
        }
        setLoading(true);
        setError("");

        try {
            // 1) raw list (includes closed)
            const ps = await engine.getAllUserPositions(userAddress);

            // 2) clean objects (ethers v6 Result loses named keys when spread)
            const cleaned = ps.map((p, i) => ({
                __index: i, // per-user index used by keeper/closePosition
                user: p.user,
                pair: p.pair,
                isLong: Boolean(p.isLong),
                entryPrice: p.entryPrice,
                marginUsed: p.marginUsed,
                leverage: p.leverage,
                tradeSize: p.tradeSize,
                timestamp: p.timestamp,
                isOpen: Boolean(p.isOpen),
                exitPrice: p.exitPrice,
                pnl: p.pnl,
                closeTimestamp: p.closeTimestamp,
                takeProfitPrice: p.takeProfitPrice,
                stopLossPrice: p.stopLossPrice,
                liquidationPrice: p.liquidationPrice,
                baseUnits: p.baseUnits,
            }));

            // 3) cross-check “open” using keeper index sets per pair
            const pairs = [...new Set(cleaned.map((x) => x.pair))];
            const openMapEntries = await Promise.all(
                pairs.map(async (pair) => {
                    try {
                        const ids = await engine.getOpenPositionIds(userAddress, pair);
                        return [pair, new Set(ids.map((id) => Number(id)))];
                    } catch {
                        // If ABI/function not present or call fails, return null so we fall back to p.isOpen
                        return [pair, null];
                    }
                })
            );
            const openMap = Object.fromEntries(openMapEntries);

            const final = cleaned.map((p) => {
                const inKeeperSet =
                    openMap[p.pair] instanceof Set
                        ? openMap[p.pair].has(p.__index)
                        : null;
                // If keeper set available, trust intersection; otherwise trust p.isOpen
                const isOpenFinal = inKeeperSet === null ? p.isOpen : p.isOpen && inKeeperSet;
                return { ...p, __openViaKeeper: inKeeperSet, isOpen: isOpenFinal };
            });

            if (mounted.current) setPositions(final);
        } catch (e) {
            console.error("useEngineReads.fetchPositions failed", e);
            if (mounted.current) setError(e?.message || "Failed to fetch positions");
        } finally {
            if (mounted.current) setLoading(false);
        }
    }, [userAddress, engine]);

    const refresh = useCallback(() => {
        fetchPositions();
    }, [fetchPositions]);

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    useEffect(() => {
        fetchPositions();
        clearInterval(pollRef.current);
        // Light poll to keep UI fresh
        pollRef.current = setInterval(fetchPositions, 10_000);
        return () => clearInterval(pollRef.current);
    }, [fetchPositions]);

    // Auto-refresh on PositionOpened/PositionClosed events
    useEffect(() => {
        if (!userAddress) return;

        const toLower = (x) => String(x || "").toLowerCase();
        const mine = toLower(userAddress);

        const onOpened = (user /*, ...rest */) => {
            if (toLower(user) === mine) refresh();
        };
        const onClosed = (user /*, ...rest */) => {
            if (toLower(user) === mine) refresh();
        };

        try {
            engine.on("PositionOpened", onOpened);
            engine.on("PositionClosed", onClosed);
        } catch {
            // ignore if not available
        }

        return () => {
            try {
                engine.off("PositionOpened", onOpened);
                engine.off("PositionClosed", onClosed);
            } catch {
                // ignore
            }
        };
    }, [engine, userAddress, refresh]);

    // Manual refresh trigger from elsewhere in the app
    useEffect(() => {
        const handler = () => refresh();
        window.addEventListener("engine:refresh", handler);
        return () => window.removeEventListener("engine:refresh", handler);
    }, [refresh]);

    return { positions, loading, error, refresh };
}
