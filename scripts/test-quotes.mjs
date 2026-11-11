// Quick check of the day/week change maths with a synthetic Yahoo response.
import { summarize } from "../src/quotes.js";
const off = -18000; // ET (EST)
const day = (d) => Date.parse(d + "T14:30:00Z") / 1000;
const res = {
  meta: { regularMarketPrice: 7520.93, regularMarketTime: day("2026-11-10") + 6 * 3600, gmtoffset: off, chartPreviousClose: 7000 },
  timestamp: ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"].map(day),
  indicators: { quote: [{ close: [7450, 7376.86, 7549.94, 7520.93] }] },
};
const s = summarize(res);
const ok = Math.abs(s.prevClose - 7549.94) < 1e-9 && Math.abs(s.chgPct - -0.3842) < 0.001 && Math.abs(s.wkPct - 1.9530) < 0.001 && s.wkRefDate === "2026-11-06";
console.log(JSON.stringify(s));
const y = summarize({ ...res, meta: { ...res.meta, regularMarketPrice: 4.983 }, indicators: { quote: [{ close: [4.84, 4.859, 4.864, 4.983] }] } }, "yield");
const ok2 = Math.abs(y.chgBp - 11.9) < 1e-6 && Math.abs(y.wkBp - 12.4) < 1e-6;
console.log(JSON.stringify(y));
// CSI 300 case: Yahoo returns only today's bar, history comes from a second source.
const cn = summarize(
  { meta: { regularMarketPrice: 4047.437, regularMarketTime: 1794366540, gmtoffset: 28800, chartPreviousClose: 4059.1106 }, timestamp: [1794366540], indicators: { quote: [{ close: [4047.437] }] } },
  undefined,
  [["2026-11-05", 4113.41], ["2026-11-06", 4054.28], ["2026-11-09", 4056.11], ["2026-11-10", 4059.11], ["2026-11-11", 4047.21]].map(([date, close]) => ({ date, close }))
);
const ok3 = cn.wkRefDate === "2026-11-06" && Math.abs(cn.wkPct - ((4047.437 - 4054.28) / 4054.28) * 100) < 1e-9 && Math.abs(cn.prevClose - 4059.11) < 1e-9 && cn.src.includes("Eastmoney");
console.log(JSON.stringify(cn));
if (!ok || !ok2 || !ok3) { console.error("FAIL"); process.exit(1); }
console.log("quotes maths OK");
