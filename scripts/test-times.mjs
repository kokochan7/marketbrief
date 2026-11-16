// Checks that times written in US Eastern time in content/brief.json are picked up for
// conversion to the viewer's time zone, and that the page renders.
import fs from "fs";
import { renderPage, timeify } from "../src/render.js";

let fail = 0;
const check = (input, ctx, want) => {
  const got = [...timeify(input, ctx).matchAll(/data-et="([^"]+)"/g)].map((m) => m[1]);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    console.error(`FAIL ${JSON.stringify(input)}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    fail++;
  }
};
const mon = { date: "2026-11-16" };
check("8:30a", mon, ["2026-11-16T08:30"]);
check("Fed minutes 2:00p, Barr 12:15p and 12:00a", mon, ["2026-11-16T14:00", "2026-11-16T12:15", "2026-11-16T00:00"]);
check("Sun 6:30p: futures up", mon, ["2026-11-15T18:30"]);
check("at 4:00 PM ET, 4pm EST, 9:30 a.m. or noon", mon, ["2026-11-16T16:00", "2026-11-16T16:00", "2026-11-16T09:30", "2026-11-16T12:00"]);
check("Sat 9:00a", { date: "2026-11-16", week: true }, ["2026-11-14T09:00"]);
check("Fri 4:00p", { date: "2026-11-16", week: true }, ["2026-11-20T16:00"]);
check("EPS $2.47, 3:1 split, ratio 10:30 pending, Oct 27–28, 8.30, 13:00", mon, []);
if (!timeify("4:20p", { ...mon, zone: true }).includes(">4:20p EST<")) (console.error("FAIL zone label"), fail++);
if (!timeify("4:20p", { date: "2026-07-14", zone: true }).includes(">4:20p EDT<")) (console.error("FAIL summer zone label"), fail++);

const brief = JSON.parse(fs.readFileSync(new URL("../content/brief.json", import.meta.url)));
const html = renderPage(brief);
if (!html.includes('id="week-h"')) (console.error("FAIL page render"), fail++);
// Macro times should all be times (or a word like TBA), never a stray format the page can't convert.
for (const d of brief.days) {
  for (const m of d.macro || []) {
    if (/\d/.test(m.time) && !timeify(m.time, { date: d.date }).includes("<time")) {
      console.error(`FAIL ${d.label}: macro time "${m.time}" isn't h:mma/p (e.g. 8:30a)`);
      fail++;
    }
  }
}
if (fail) process.exit(1);
console.log(`times OK (${(html.match(/<time class="lt"/g) || []).length} times on the page)`);
