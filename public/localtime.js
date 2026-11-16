// Shows every time on the page in the viewer's own time zone.
// The brief is written in US Eastern time. The server marks each time as
// <time class="lt" data-et="YYYY-MM-DDTHH:MM"> (Eastern wall-clock time, rendered
// as Eastern by default) and this script rewrites it for the browser's zone,
// e.g. 8:30a EST -> 5:30a PST. Elements with [data-tz-label] get the zone
// abbreviation. live.js and tickers.js use window.MBTime.stamp() for "as of" times.
(function () {
  const ET = "America/New_York";
  let zone;
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ET;
  } catch (e) {
    zone = ET;
  }

  const partsCache = {};
  function fmt(tz, opts) {
    const k = tz + JSON.stringify(opts);
    return partsCache[k] || (partsCache[k] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", ...opts }));
  }

  // Wall-clock fields of an instant in a zone.
  function wall(ms, tz) {
    const p = {};
    for (const x of fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short" }).formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: p.weekday };
  }

  // Eastern wall-clock time -> UTC milliseconds (handles EST/EDT).
  function etToMs(y, mo, d, h, mi) {
    const target = Date.UTC(y, mo - 1, d, h, mi);
    let t = target + 5 * 3600e3;
    for (let i = 0; i < 3; i++) {
      const w = wall(t, ET);
      const diff = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - target;
      if (!diff) break;
      t -= diff;
    }
    return t;
  }

  // Short zone name: EST, PST, CET, JST... falls back to "GMT+9" style when no abbreviation exists.
  // Zones with no DST whose common abbreviation Intl doesn't give in English.
  const FIXED = { "Asia/Tokyo": "JST", "Asia/Seoul": "KST", "Asia/Hong_Kong": "HKT", "Asia/Singapore": "SGT", "Asia/Manila": "PHT", "Asia/Jakarta": "WIB" };
  function abbr(ms, tz) {
    if (FIXED[tz]) return FIXED[tz];
    const langs = ["en-US", "en-GB", "en-AU", "en-IN"].concat(navigator.languages || [navigator.language]).filter(Boolean);
    let fallback = "";
    for (const lang of langs) {
      try {
        const p = new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: "short" }).formatToParts(new Date(ms));
        const n = (p.find((x) => x.type === "timeZoneName") || {}).value || "";
        if (!fallback) fallback = n;
        if (/^[A-Z]{2,5}$/.test(n)) return n;
      } catch (e) {}
    }
    return fallback || tz;
  }

  // 8:30a style, matching the brief's own format.
  const compact = (w) => `${w.h % 12 || 12}:${String(w.mi).padStart(2, "0")}${w.h < 12 ? "a" : "p"}`;
  const dayNum = (w) => Date.UTC(w.y, w.mo - 1, w.d) / 864e5;

  // "Sun 6:19 PM PST" for live "as of" stamps.
  function stamp(ms) {
    const w = wall(ms, zone);
    return `${w.wd} ${w.h % 12 || 12}:${String(w.mi).padStart(2, "0")} ${w.h < 12 ? "AM" : "PM"} ${abbr(ms, zone)}`;
  }

  window.MBTime = { zone, stamp, abbr: (ms) => abbr(ms, zone) };

  let shifted = false;
  for (const el of document.querySelectorAll("time.lt[data-et]")) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(el.dataset.et);
    if (!m) continue;
    const ms = etToMs(+m[1], +m[2], +m[3], +m[4], +m[5]);
    const local = wall(ms, zone);
    const east = wall(ms, ET);
    const shift = dayNum(local) - dayNum(east);
    let text = compact(local);
    // A weekday written before the time moves with it ("Sun 6:30p" -> "Mon 7:30a" in Tokyo);
    // otherwise a day change is flagged with +1 / −1.
    if (el.dataset.wd) text = `${local.wd} ${text}`;
    let html = text;
    if (shift && !el.dataset.wd) {
      html += `<sup class="lt-shift" title="${shift > 0 ? "Next" : "Previous"} day in your time zone">${shift > 0 ? "+" : "−"}${Math.abs(shift)}</sup>`;
      shifted = true;
    }
    if (el.dataset.z) html += " " + abbr(ms, zone);
    el.innerHTML = html;
    el.title = (el.title ? el.title + " · " : "") + `${el.dataset.wd ? east.wd + " " : ""}${compact(east)} ${abbr(ms, ET)} (US Eastern)`;
  }
  if (shifted) document.documentElement.classList.add("has-dayshift");

  for (const el of document.querySelectorAll("[data-tz-label]")) {
    const ms = Date.parse(el.dataset.tzLabel) || Date.now();
    const a = abbr(ms, zone);
    el.textContent = (el.dataset.tzPrefix || "") + a;
    if (zone !== ET) el.title = `Shown in your time zone (${zone}). The brief is written in US Eastern time.`;
  }
})();
