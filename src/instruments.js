// Live-strip instruments: Yahoo Finance symbol for data and for the page each tile opens.
export const INSTRUMENTS = [
  { key: "spy", label: "SPDR S&P 500", name: "SPDR S&P 500 ETF Trust (SPY)", sym: "SPY", unit: "usd" },
  { key: "qqq", label: "Invesco QQQ", name: "Invesco QQQ Trust (QQQ)", sym: "QQQ", unit: "usd" },
  { key: "tnx", label: "US 10Y", name: "US 10-Year Treasury yield (Cboe TNX)", sym: "^TNX", unit: "yield" },
  { key: "wti", label: "Crude Oil WTI", name: "WTI crude oil, front-month futures", sym: "CL=F", unit: "usd" },
  { key: "gold", label: "Gold", name: "Gold, front-month futures", sym: "GC=F", unit: "usd" },
  { key: "btc", label: "Bitcoin", name: "Bitcoin (USD)", sym: "BTC-USD", unit: "usd" },
  { key: "dxy", label: "Dollar (DXY)", name: "US Dollar Index", sym: "DX-Y.NYB" },
  { key: "kospi", label: "KOSPI", name: "KOSPI Composite Index (Korea)", sym: "^KS11" },
  { key: "csi300", label: "CSI 300", name: "CSI 300 Index (China)", sym: "000300.SS", em: "1.000300" },
];

export const yahooQuoteUrl = (sym) => `https://finance.yahoo.com/quote/${encodeURIComponent(sym).replace(/%3D/g, "=")}/`;

export const instrumentUrl = (it) => it.url || yahooQuoteUrl(it.sym);
