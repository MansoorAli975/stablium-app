import "./styles.css";
import WalletConnect from "./components/WalletConnect";
import Market from "./components/Market";
import TradePanel from "./components/TradePanel";
import Chart from "./components/Chart";
import BottomPanel from "./components/BottomPanel";
import { useState, useEffect } from "react";
import { fetchQuotePrice } from "./utils/quoteAPI";
import { watchTpSl } from "./utils/tpSlWatcher";

function App() {
  const [showTradeBox, setShowTradeBox] = useState(true);
  const toggleTradeBox = () => setShowTradeBox((prev) => !prev);

  const [selectedSymbol, setSelectedSymbol] = useState("EUR/USD");
  const [forexPrice, setForexPrice] = useState(null);
  const [userAddress, setUserAddress] = useState(null); // 📌 placeholder for connected wallet

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

  useEffect(() => {
    const fetchData = async () => {
      const price = await fetchQuotePrice("EUR/USD");
      setForexPrice(price);
    };

    fetchData();
    const intervalId = setInterval(fetchData, 65000);
    return () => clearInterval(intervalId);
  }, []);

  // ✅ TP/SL Watcher: check every 15s
  useEffect(() => {
    const interval = setInterval(() => {
      if (userAddress) {
        watchTpSl(userAddress);
      }
    }, 15000); // every 15 seconds

    return () => clearInterval(interval);
  }, [userAddress]);

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
                  – The Futur of Decentralized Trading
                </span>
              </h1>
            </div>
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
            <WalletConnect onConnect={setUserAddress} />
            <TradePanel
              togglePanel={toggleTradeBox}
              isOpen={showTradeBox}
              forexPrice={forexPrice}
              selectedSymbol={selectedSymbol}
            />
          </div>
        </div>
      </div>
      <BottomPanel />
    </div>
  );
}

export default App;
