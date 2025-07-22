import "./styles.css";
import WalletConnect from "./components/WalletConnect";
import Market from "./components/Market";
import TradePanel from "./components/TradePanel";
import Chart from "./components/Chart";
import BottomPanel from "./components/BottomPanel";
import { useState, useEffect } from "react";
import { fetchQuotePrice } from "./utils/quoteAPI";
import { watchTpSl } from "./utils/tpSlWatcher";
import { getForexEngineContract } from "./utils/contract"; // ✅ import contract logic
import { ethers } from "ethers"; // ✅ required for formatting

function App() {
  const [showTradeBox, setShowTradeBox] = useState(true);
  const toggleTradeBox = () => setShowTradeBox((prev) => !prev);

  const [selectedSymbol, setSelectedSymbol] = useState("EUR/USD");
  const [forexPrice, setForexPrice] = useState(null);

  const [userAddress, setUserAddress] = useState(null);
  const [signer, setSigner] = useState(null);

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

  // ✅ Fetch price periodically
  useEffect(() => {
    const fetchData = async () => {
      const price = await fetchQuotePrice("EUR/USD", signer);
      setForexPrice(price);
    };

    fetchData();
    const intervalId = setInterval(fetchData, 65000);
    return () => clearInterval(intervalId);
  }, [signer]);

  // ✅ TP/SL Watcher
  useEffect(() => {
    const interval = setInterval(() => {
      if (userAddress) {
        watchTpSl(userAddress);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [userAddress]);

  // ✅ Test on-chain contract function (getDerivedPrice)
  useEffect(() => {
    const testDerivedPrice = async () => {
      try {
        if (!signer) return;

        const contract = getForexEngineContract(signer);
        const result = await contract.getDerivedPrice("EUR", "USD");
        console.log("🧠 getDerivedPrice(EUR/USD):", ethers.formatUnits(result, 18));
      } catch (e) {
        console.error("❌ Failed to fetch getDerivedPrice from chain", e);
      }
    };

    testDerivedPrice();
  }, [signer]);

  return (
    <div className="app-wrapper">
      <div className="app-container">
        {/* Left Panel */}
        <div className="left-panel">
          <Market
            onSelectSymbol={setSelectedSymbol}
            selectedSymbol={selectedSymbol}
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

          <div className="chart-area-wrapper">
            <div className="chart-container">
              <Chart selectedSymbol={selectedSymbol} forexPrice={forexPrice} />
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="right-panel">
          <div className="right-panel-inner">
            <WalletConnect setSigner={setSigner} setUserAddress={setUserAddress} />
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
          </div>
        </div>
      </div>
      <BottomPanel tradeHistory={tradeHistory} />
    </div>
  );
}

export default App;
