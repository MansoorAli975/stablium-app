const [P,D,MR,BAL,CUR] = process.argv.slice(2).map(s=>BigInt(s));
const pow10 = n => 10n**n;
const usd1e18 = (amtWei, price, priceDec)=> (amtWei*price)/pow10(priceDec);

/* Position 3 (from your on-chain dump):
   pair="EUR", isLong=true, entry=116780000, marginUsed=0.003 WETH,
   leverage=2, tradeSize=0.006 WETH-equivalent (used in PnL formula) */
const entry     = 116780000n;
const tradeSize = 6000000000000000n; // 0.006e18
const marginWei = 3000000000000000n; // 0.003e18

// Collateral in USD(1e18)
const collateralUSD = usd1e18(BAL,P,D);

// Unrealized PnL for a long: size*(cur-entry)/entry  -> units: wei
const uPnL = (tradeSize * (CUR - entry)) / entry;

// Equity = collateralUSD + uPnL  (all 1e18)
const equity = collateralUSD + uPnL;

// Used margin stored on-chain is the denominator in MR: MR = equity/used * 10000
const used = (equity * 10000n) / MR;

// What closePosition() will try to subtract (recomputed at *current* ETH price)
const pos3MarginUSDnow = usd1e18(marginWei,P,D);

// If this is larger than 'used', the SafeMath.sub will underflow (panic 0x11)
const underflow = pos3MarginUSDnow > used;

// If underflow, compute the minimal additional margin (in wei) needed now to make it safe.
const deficitUSD = underflow ? (pos3MarginUSDnow - used) : 0n;
// ceil( deficitUSD * 10^D / P )
const neededWei = deficitUSD === 0n ? 0n : (deficitUSD*pow10(D) + (P-1n)) / P;

console.log(JSON.stringify({
  wethPrice: P.toString(),
  feedDecimals: D.toString(),
  marginRatioBps: MR.toString(),
  collateralWei: BAL.toString(),
  eurPrice: CUR.toString(),
  collateralUSD_1e18: collateralUSD.toString(),
  unrealizedPnl_1e18: uPnL.toString(),
  equity_1e18: equity.toString(),
  usedMarginUSD_1e18: used.toString(),
  pos3_marginUSD_now_1e18: pos3MarginUSDnow.toString(),
  underflowIfClosePos3: underflow,
  deficitUSD_1e18: deficitUSD.toString(),
  suggestedDustMarginWei: neededWei.toString()
}, null, 2));
