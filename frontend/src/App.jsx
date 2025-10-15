import "./styles.css";
import WalletConnect from "./components/WalletConnect";
import Market from "./components/Market";
import TradePanel from "./components/TradePanel";
import Chart from "./components/Chart";
import BottomPanel from "./components/BottomPanel";
import Balances from "./components/Balances";
import DepositBox from "./components/DepositBox";
import { useState, useEffect, useMemo } from "react";
import { watchTpSl } from "./utils/tpSlWatcher";
import { getForexEngineContract } from "./utils/contract";
import { ethers } from "ethers";
import { splitUiSymbol } from "./utils/pairs";
import { useEngineReads } from "./hooks/useEngineReads";
import { fetchCollateralSnapshot, formatTokenAmount } from "./utils/balances";
import { CHAIN_ID } from "./config/engine";

// ⬇️ NEW: Amend TP/SL modal
import AmendTpSl from "./components/AmendTpSl";

const RPC_URL = import.meta?.env?.VITE_RPC_URL || "";

function App() {
  const [showTradeBox, setShowTradeBox] = useState(true);
  const toggleTradeBox = () => setShowTradeBox((prev) => !prev);

  const [selectedSymbol, setSelectedSymbol] = useState("EUR/USD");
  const [forexPrice, setForexPrice] = useState(null);

  const [userAddress, setUserAddress] = useState(null);
  const [signer, setSigner] = useState(null);

  // Mock balances (synthetics etc.) — kept for now
  const [balances, setBalances] = useState({
    STB: 750.0,
    WETH: 1.2531,
    sUSD: 1000.0,
    sEUR: 920.75,
    sGBP: 785.6,
    sJPY: 150200.5,
    sXAU: 0.52,
    sXAG: 14.0,
  });

  const [tradeHistory, setTradeHistory] = useState([]);

  // Pause / Circuit-breaker flags
  const [paused, setPaused] = useState(false);
  const [cbTriggered, setCbTriggered] = useState(false);

  // Network state
  const [currentChainId, setCurrentChainId] = useState(null);
  const [networkOk, setNetworkOk] = useState(true);

  // Collateral snapshot (real on-chain collateral)
  const [collateralSnap, setCollateralSnap] = useState([]);

  // On-chain positions (Stage 1 hook)
  const {
    positions,
    loading: positionsLoading,
    error: positionsError,
    refresh,
  } = useEngineReads(userAddress, signer);

  // 🔹 ENV check (runs once at mount, dev only, avoids double logs)
  useEffect(() => {
    if (import.meta.env.MODE !== "development") return;
    if (window.__envCheckLogged) return; // guard against StrictMode double-run
    window.__envCheckLogged = true;

    console.info("[ENV CHECK]", {
      ENGINE: import.meta.env.VITE_ENGINE_ADDRESS,
      RPC_URL: (import.meta.env.VITE_RPC_URL || "").slice(0, 40) + "…",
      CHAIN_ID: import.meta.env.VITE_CHAIN_ID,
      WETH: import.meta.env.VITE_WETH_ADDRESS,
    });
  }, []);

  // 🔹 Fetch price via RPC
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        if (!RPC_URL) {
          setForexPrice(null);
          return;
        }
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const contract = getForexEngineContract(provider);
        const [base, quote] = splitUiSymbol(selectedSymbol);
        const rawPrice = await contract.getDerivedPrice(base, quote);
        const formattedPrice = ethers.formatUnits(rawPrice, 18);

        setForexPrice(formattedPrice);

        // 👉 broadcast the exact 1e18 price so BottomPanel (and others) can update immediately
        window.dispatchEvent(
          new CustomEvent("price:update", {
            detail: { base, quote, price1e18: rawPrice }
          })
        );
      } catch (err) {
        const msg = String(err?.message || err);
        if (!msg.includes("ForexEngine__StalePrice")) {
          console.error("Failed to fetch price from chain:", err);
        }
        setForexPrice(null);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 65000);
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  // 🔹 Instant refresh when deposit completes
  useEffect(() => {
    const onChanged = () => {
      if (!userAddress) return;
      fetchCollateralSnapshot(userAddress, signer)
        .then((s) => {
          console.log("collateral snapshot (event)", s);
          setCollateralSnap(s);
        })
        .catch((e) =>
          console.warn("Snapshot (event) failed:", e?.message || e)
        );
    };
    window.addEventListener("collateral:changed", onChanged);
    return () =>
      window.removeEventListener("collateral:changed", onChanged);
  }, [userAddress, signer]);

  // 🔹 TP/SL Watcher
  useEffect(() => {
    const interval = setInterval(() => {
      if (userAddress) {
        watchTpSl(userAddress);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [userAddress]);

  // 🔹 Collateral snapshot (poll)
  useEffect(() => {
    let stop = false;

    const run = async () => {
      if (!userAddress) {
        setCollateralSnap([]);
        return;
      }
      try {
        const snapshot = await fetchCollateralSnapshot(userAddress, signer);
        console.log("collateral snapshot", snapshot);

        if (!stop) setCollateralSnap(snapshot);
      } catch (e) {
        console.warn("Collateral snapshot failed:", e?.message || e);
      }
    };

    run();
    const id = setInterval(run, 20000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [userAddress, signer]);

  // 🔹 Paused / circuit breaker flags
  useEffect(() => {
    let stop = false;
    let timer;

    const run = async () => {
      try {
        if (!RPC_URL) return;
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const engine = getForexEngineContract(provider);
        const [p, cb] = await Promise.all([
          engine.isContractPaused(),
          engine.isCircuitBreakerTriggered(),
        ]);
        if (!stop) {
          setPaused(Boolean(p));
          setCbTriggered(Boolean(cb));
        }
      } catch (e) {
        console.warn("Status read failed:", e?.message || e);
      } finally {
        if (!stop) timer = setTimeout(run, 20000);
      }
    };

    run();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  // 🔹 Network check
  useEffect(() => {
    let stop = false;

    const run = async () => {
      try {
        let provider = null;
        if (typeof window !== "undefined" && window.ethereum) {
          provider = new ethers.BrowserProvider(window.ethereum);
        } else if (RPC_URL) {
          provider = new ethers.JsonRpcProvider(RPC_URL);
        } else {
          return;
        }

        const net = await provider.getNetwork();
        if (!stop) {
          const cid = Number(net?.chainId ?? 0);
          setCurrentChainId(cid);
          setNetworkOk(cid === Number(CHAIN_ID));
        }
      } catch (e) {
        console.warn("Network read failed:", e?.message || e);
      }
    };

    run();

    if (typeof window !== "undefined" && window.ethereum) {
      const onChainChanged = () => run();
      window.ethereum.on?.("chainChanged", onChainChanged);
      return () =>
        window.ethereum.removeListener?.("chainChanged", onChainChanged);
    }

    return () => {
      stop = true;
    };
  }, [signer]);

  // 🔹 Build balances object for UI
  const collateralBalances = useMemo(() => {
    const out = {};
    for (const row of collateralSnap) {
      out[row.symbol] = formatTokenAmount(row.deposited, row.decimals);
    }
    return out;
  }, [collateralSnap]);

  return (
    <div className="app-wrapper">
      <div className="app-container">
        {/* Left Panel */}
        <div className="left-panel">
          <Market
            onSelectSymbol={setSelectedSymbol}
            selectedSymbol={selectedSymbol}
            signer={signer}
          />
        </div>

        {/* Middle Panel */}
        <div className="middle-panel">
          <div className="top-bar">
            <div className="left-top">
              <h1 className="market-title">
                <span className="radiant-text">Synthetic Trading</span>
                <span className="inline-tagline">
                  {" "}
                  – The Future of Decentralized Trading
                </span>
              </h1>
            </div>
          </div>

          {/* Error banners */}
          {positionsError && (
            <div className="error-banner">
              Positions error: {positionsError}
            </div>
          )}

          {(paused || cbTriggered) && (
            <div
              className={`status-banner ${paused ? "paused" : ""} ${cbTriggered ? "breaker" : ""
                }`}
            >
              {paused && <span>⏸ Trading is paused by admin. </span>}
              {cbTriggered && (
                <span>
                  ⚠️ Circuit breaker is active. Trading actions are disabled.
                </span>
              )}
            </div>
          )}

          {!networkOk && (
            <div className="status-banner breaker">
              Wrong network. Expected chain ID {String(CHAIN_ID)}, got{" "}
              {String(currentChainId ?? "unknown")}. Please switch to Sepolia.
            </div>
          )}

          <div style={{ fontSize: 12, opacity: 0.7, margin: "6px 0" }}>
            Connected: {userAddress || "—"} · Positions: {positions?.length ?? 0}
          </div>

          <div className="chart-area-wrapper">
            <div className="chart-container">
              <Chart
                selectedSymbol={selectedSymbol}
                forexPrice={forexPrice}
              />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="right-panel-inner">
            <WalletConnect
              setSigner={setSigner}
              setUserAddress={setUserAddress}
            />
            <DepositBox signer={signer} userAddress={userAddress} />
            <TradePanel
              togglePanel={toggleTradeBox}
              isOpen={showTradeBox}
              forexPrice={forexPrice}
              selectedSymbol={selectedSymbol}
              signer={signer}
              userAddress={userAddress}
              setBalances={setBalances}
              balances={balances}
              setTradeHistory={setTradeHistory}
            />
            <Balances
              balances={collateralBalances}
              knownSymbols={["WETH"]}
            />
          </div>
        </div>
      </div>

      <BottomPanel tradeHistory={positions} refreshTrades={refresh} />

      {/* ⬇️ Mounted once so any row can open it via window.dispatchEvent */}
      <AmendTpSl />
    </div>
  );
}

export default App;
