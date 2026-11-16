// Live-strip instruments. `sym` is the Yahoo Finance symbol used for data and for the
// page each tile opens; `cnbc` instruments come from CNBC's quote feed instead (Yahoo has
// no 2-year yield index); `calc` tiles are computed in the Worker. Order = tile order.
export const INSTRUMENTS = [
  { key: "es", label: "S&P Fut", name: "E-mini S&P 500 futures (ES=F)", sym: "ES=F", unit: "pts" },
  { key: "nq", label: "Nasdaq Fut", name: "E-mini Nasdaq-100 futures (NQ=F)", sym: "NQ=F", unit: "pts" },
  { key: "ym", label: "Dow Fut", name: "E-mini Dow futures (YM=F)", sym: "YM=F", unit: "pts" },
  { key: "spy", label: "SPDR S&P 500", name: "SPDR S&P 500 ETF Trust (SPY)", sym: "SPY", unit: "usd" },
  { key: "qqq", label: "Invesco QQQ", name: "Invesco QQQ Trust (QQQ)", sym: "QQQ", unit: "usd" },
  { key: "btc", label: "Bitcoin", name: "Bitcoin (USD)", sym: "BTC-USD", unit: "usd" },
  { key: "wti", label: "Crude Oil WTI", name: "WTI crude oil, front-month futures", sym: "CL=F", unit: "usd" },
  { key: "us2y", label: "US 2Y", name: "US 2-Year Treasury yield", cnbc: "US2Y", unit: "yield", url: "https://www.cnbc.com/quotes/US2Y" },
  { key: "tnx", label: "US 10Y", name: "US 10-Year Treasury yield (Cboe TNX)", sym: "^TNX", unit: "yield" },
  { key: "s2s10", label: "2s10s Curve", name: "10-year minus 2-year Treasury yield (CNBC yields)", calc: "2s10s", unit: "spread", url: "https://fred.stlouisfed.org/series/T10Y2Y" },
  { key: "gold", label: "Gold", name: "Gold, front-month futures", sym: "GC=F", unit: "usd" },
  { key: "dxy", label: "Dollar (DXY)", name: "US Dollar Index", sym: "DX-Y.NYB" },
  { key: "kospi", label: "KOSPI", name: "KOSPI Composite Index (Korea)", sym: "^KS11" },
  { key: "csi300", label: "CSI 300", name: "CSI 300 Index (China)", sym: "000300.SS", em: "1.000300" },
];

// Sector heatmap in Market Mood: the 11 Select Sector SPDR ETFs.
export const SECTORS = [
  { sym: "XLK", label: "Tech", name: "Technology" },
  { sym: "XLC", label: "Comms", name: "Communication Services" },
  { sym: "XLY", label: "Discr.", name: "Consumer Discretionary" },
  { sym: "XLF", label: "Financials", name: "Financials" },
  { sym: "XLI", label: "Industrials", name: "Industrials" },
  { sym: "XLV", label: "Health", name: "Health Care" },
  { sym: "XLE", label: "Energy", name: "Energy" },
  { sym: "XLB", label: "Materials", name: "Materials" },
  { sym: "XLP", label: "Staples", name: "Consumer Staples" },
  { sym: "XLU", label: "Utilities", name: "Utilities" },
  { sym: "XLRE", label: "Real Est.", name: "Real Estate" },
];

export const yahooQuoteUrl = (sym) => `https://finance.yahoo.com/quote/${encodeURIComponent(sym).replace(/%3D/g, "=")}/`;

export const instrumentUrl = (it) => it.url || yahooQuoteUrl(it.sym);
