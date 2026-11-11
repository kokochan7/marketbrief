// Live-strip instruments: Yahoo Finance symbol for data, Google Finance page for clicks.
export const INSTRUMENTS = [
  { key: "spy", label: "SPDR S&P 500", name: "SPDR S&P 500 ETF Trust (SPY)", sym: "SPY", unit: "usd", google: "SPY:NYSEARCA" },
  { key: "qqq", label: "Invesco QQQ", name: "Invesco QQQ Trust (QQQ)", sym: "QQQ", unit: "usd", google: "QQQ:NASDAQ" },
  { key: "tnx", label: "US 10Y", name: "US 10-Year Treasury yield (Cboe TNX)", sym: "^TNX", unit: "yield", google: "TNX:INDEXCBOE" },
  { key: "wti", label: "Crude Oil WTI", name: "WTI crude oil, front-month futures", sym: "CL=F", unit: "usd", google: "CLW00:NYMEX" },
  { key: "gold", label: "Gold", name: "Gold, front-month futures", sym: "GC=F", unit: "usd", google: "GCW00:COMEX" },
  { key: "btc", label: "Bitcoin", name: "Bitcoin (USD)", sym: "BTC-USD", unit: "usd", google: "BTC-USD" },
  { key: "dxy", label: "Dollar (DXY)", name: "US Dollar Index", sym: "DX-Y.NYB", url: "https://www.google.com/search?q=US+Dollar+Index+DXY" }, // Google Finance has no DXY page
  { key: "kospi", label: "KOSPI", name: "KOSPI Composite Index (Korea)", sym: "^KS11", google: "KOSPI:KRX" },
  { key: "csi300", label: "CSI 300", name: "CSI 300 Index (China)", sym: "000300.SS", google: "000300:SHA" },
];

export const instrumentUrl = (it) => it.url || googleQuoteUrl(it.google);

export const googleQuoteUrl = (g) => `https://www.google.com/finance/quote/${encodeURIComponent(g).replace(/%3A/g, ":")}`;
