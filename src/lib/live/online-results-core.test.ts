import assert from "node:assert/strict";
import { test } from "node:test";

import {
  categoryShort,
  categorySlugs,
  DEFAULT_DNS_GRACE_FALLBACK_S,
  DEFAULT_DNS_GRACE_S,
  decodeOnline,
  effectiveDnsGrace,
  encodeOnline,
  findCategoryBySlug,
  hasStarted,
  isDns,
  lateStart,
  lossOf,
  onlineCategoryState,
  searchStatus,
  slugify,
  type OnlineRunner,
} from "./online-results-core";
import { categoryState } from "./speaker-core";

const T0 = 1_800_000_000; // libovolná epocha (s)
const GRACE = DEFAULT_DNS_GRACE_S;

function runner(
  bib: number,
  start: number,
  times: Partial<Pick<OnlineRunner, "m1" | "m2" | "fin" | "started" | "late">> = {},
): OnlineRunner {
  return {
    bib,
    name: `Běžec ${bib}`,
    cat: "B",
    start: T0 + start,
    m1: times.m1 ?? null,
    m2: times.m2 ?? null,
    fin: times.fin ?? null,
    started: times.started ?? false,
    late: times.late ?? null,
  };
}

const bibs = (list: readonly { bib: number }[]) => list.map((r) => r.bib);

test("defaults: DNS grace 5 min, fallback 30 min (Q113, Q114)", () => {
  assert.equal(DEFAULT_DNS_GRACE_S, 300);
  assert.equal(DEFAULT_DNS_GRACE_FALLBACK_S, 1800);
  assert.equal(effectiveDnsGrace(true, 300, 1800), 300);
  assert.equal(effectiveDnsGrace(false, 300, 1800), 1800);
});

test("DNS only after the grace from the planned start, waiting until then", () => {
  const r = runner(286, 0);
  assert.equal(isDns(r, T0 + GRACE, GRACE), false);
  assert.equal(isDns(r, T0 + GRACE + 1, GRACE), true);
  const before = onlineCategoryState([r], T0 + GRACE, GRACE);
  assert.deepEqual(bibs(before.waiting), [286]);
  assert.deepEqual(bibs(before.dns), []);
  const after = onlineCategoryState([r], T0 + GRACE + 1, GRACE);
  assert.deepEqual(bibs(after.waiting), []);
  assert.deepEqual(bibs(after.dns), [286]);
});

test("fallback grace: without any Start record nobody is DNS before 30 min (Q113)", () => {
  const grace = effectiveDnsGrace(false, DEFAULT_DNS_GRACE_S, DEFAULT_DNS_GRACE_FALLBACK_S);
  const r = runner(5, 0);
  const at20 = onlineCategoryState([r], T0 + 20 * 60, grace);
  assert.deepEqual(bibs(at20.waiting), [5]);
  const at31 = onlineCategoryState([r], T0 + 31 * 60, grace);
  assert.deepEqual(bibs(at31.dns), [5]);
});

test("late start: DNS first, back among runners once the Start record or a split arrives", () => {
  const now = T0 + 9 * 60;
  // bez záznamu 9 min po plánu → DNS
  const missing = runner(209, 0);
  assert.deepEqual(bibs(onlineCategoryState([missing], now, GRACE).dns), [209]);
  // přišel záznam Startu (pozdní start +8:10) → odstartovaní bez mezičasu
  const started = runner(209, 0, { started: true, late: 490 });
  const s1 = onlineCategoryState([started], now, GRACE);
  assert.deepEqual(bibs(s1.dns), []);
  assert.deepEqual(bibs(s1.running), [209]);
  assert.equal(s1.onCourse, 1);
  // mezičas bez záznamu Startu = taky odstartoval
  const split = runner(209, 0, { m1: 14 * 60 + 30 });
  assert.equal(hasStarted(split), true);
  const s2 = onlineCategoryState([split], T0 + 20 * 60, GRACE);
  assert.deepEqual(bibs(s2.rows.map((r) => r.runner)), [209]);
  assert.deepEqual(bibs(s2.dns), []);
});

test("time always counts from the planned start of the start list (Q115)", () => {
  const late = runner(209, 0, { started: true, late: 490 });
  const st = searchStatus(late, [late], T0 + 600, GRACE);
  assert.deepEqual(st, { kind: "running", live: 600 });
  // virtuální pořadí i ✓ se počítají z času od plánu – pozdní starter blokuje ✓ jako ostatní
  const winner = runner(1, -1200, { m1: 300, m2: 600, fin: 900 });
  const s = onlineCategoryState([winner, late], T0 + 600, GRACE);
  assert.equal(s.rows[0].final, false); // 600 s < 900 s – ještě může předběhnout
  const s2 = onlineCategoryState([winner, late], T0 + 901, GRACE);
  assert.equal(s2.rows[0].final, true);
});

test("sections: combined list, then started without split, waiting and DNS by start time", () => {
  const now = T0 + 3600;
  const list = [
    runner(30, 3700), // čeká (start za 100 s)
    runner(10, 600, { m1: 330, m2: 650, fin: 1000 }),
    runner(12, 2900, { m1: 320, m2: 640 }), // na trati, M2 lepší než cílový → nad něj
    runner(25, 3500, { started: true }),
    runner(21, 3300, { started: true }),
    runner(29, 3650), // čeká (na startu, nepotvrzen)
    runner(15, 1200), // DNS
    runner(14, 1100), // DNS
  ];
  const s = onlineCategoryState(list, now, GRACE);
  assert.deepEqual(bibs(s.rows.map((r) => r.runner)), [12, 10]);
  assert.deepEqual(bibs(s.running), [21, 25]);
  assert.deepEqual(bibs(s.waiting), [29, 30]);
  assert.deepEqual(bibs(s.dns), [14, 15]);
  assert.equal(s.total, 8);
  assert.equal(s.finished, 1);
  assert.equal(s.onCourse, 3);
  assert.equal(s.best, 1000);
  assert.equal(s.done, false);
  assert.equal(s.firstStart, T0 + 600);
  assert.equal(s.lastStart, T0 + 3700);
});

test("rows are exactly the speaker's combined list – whole category, not top 10", () => {
  const now = T0 + 5000;
  const list = Array.from({ length: 14 }, (_, i) =>
    runner(i + 1, i * 15, { m1: 300 + i, m2: 600 + i, fin: 900 + ((i * 7) % 14) }),
  );
  const s = onlineCategoryState(list, now, GRACE);
  const speaker = categoryState(list, now, 1000);
  assert.equal(s.rows.length, 14);
  assert.deepEqual(
    s.rows.map((r) => [r.runner.bib, r.rank, r.final, r.recent]),
    speaker.shown.map((r) => [r.runner.bib, r.rank, r.final, r.recent]),
  );
});

test("category is final only when nobody is on course or waiting and all finishers have ✓", () => {
  const a = runner(1, 0, { m1: 300, m2: 600, fin: 900 });
  const b = runner(2, 15, { m1: 310, m2: 620, fin: 950 });
  const dns = runner(3, 30);
  // DNS blokuje ✓, dokud jeho čas od plánu nepřesáhne cílové časy
  assert.equal(onlineCategoryState([a, b, dns], T0 + 900, GRACE).done, false);
  assert.equal(onlineCategoryState([a, b, dns], T0 + 30 + 951, GRACE).done, true);
  // čekající na start → nikdy konečné
  const waiting = runner(4, 5000);
  assert.equal(onlineCategoryState([a, b, waiting], T0 + 4000, GRACE).done, false);
});

test("lateStart uses the Start offset threshold (#228)", () => {
  assert.equal(lateStart(120, 120), null);
  assert.equal(lateStart(121, 120), 121);
  assert.equal(lateStart(-500, 120), null);
  assert.equal(lateStart(null, 120), null);
});

test("lossOf: winner and unfinished have no loss", () => {
  assert.equal(lossOf(1000, 1000), null);
  assert.equal(lossOf(1039, 1000), 39);
  assert.equal(lossOf(null, 1000), null);
  assert.equal(lossOf(1000, null), null);
});

test("searchStatus covers all states", () => {
  const fin = runner(1, 0, { m1: 300, m2: 600, fin: 900 });
  const on = runner(2, 0, { m1: 300 });
  const wait = runner(3, 1000);
  const dns = runner(4, 0);
  const cat = [fin, on, wait, dns];
  const now = T0 + 700;
  assert.deepEqual(searchStatus(fin, cat, now, GRACE), { kind: "finished", time: 900, rank: 1 });
  assert.deepEqual(searchStatus(on, cat, now, GRACE), {
    kind: "on-course",
    point: "m1",
    time: 300,
  });
  assert.deepEqual(searchStatus(wait, cat, now, GRACE), { kind: "waiting", start: T0 + 1000 });
  assert.deepEqual(searchStatus(dns, cat, now, GRACE), { kind: "dns" });
});

test("category slugs and short labels", () => {
  assert.equal(slugify("muži nad 40 let"), "muzi-nad-40-let");
  assert.equal(slugify("Žákyně"), "zakyne");
  assert.deepEqual(
    categorySlugs([
      { id: "A", name: "muži" },
      { id: "B", name: "Muži" },
      { id: "C", name: "***" },
    ]),
    ["muzi", "muzi-b", "c"],
  );
  assert.equal(categoryShort("muži nad 40 let"), "M 40");
  assert.equal(categoryShort("ženy nad 60 let"), "Ž 60");
  assert.equal(categoryShort("dorostenci"), "Dorci");
  assert.equal(categoryShort("dorostenky"), "Dorky");
  assert.equal(categoryShort("žáci"), "Žáci");
  const cats = [{ slug: "muzi" }, { slug: "zeny" }];
  assert.equal(findCategoryBySlug(cats, "ZENY")?.slug, "zeny");
  assert.equal(findCategoryBySlug(cats, "x"), null);
  assert.equal(findCategoryBySlug(cats, undefined), null);
});

test("encodeOnline/decodeOnline round-trip the compact wire format", () => {
  const snapshot = {
    year: 2026,
    dnsGraceS: 300,
    categories: [{ id: "A", name: "muži", sex: "M", slug: "muzi", short: "Muži" }],
    runners: [
      {
        bib: 1,
        name: "Nováček Jan",
        cat: "A",
        start: 1000,
        m1: 300,
        m2: null,
        fin: null,
        started: true,
        late: 150,
      },
      {
        bib: 2,
        name: "Dvořák Petr",
        cat: "A",
        start: 1015,
        m1: null,
        m2: null,
        fin: null,
        started: false,
        late: null,
      },
    ],
  };
  const wire = encodeOnline(snapshot);
  assert.deepEqual(wire.r[0], [1, "Nováček Jan", "A", 1000, 300, null, null, 1, 150]);
  assert.ok(JSON.stringify(wire).length < JSON.stringify(snapshot).length * 0.75);
  assert.deepEqual(decodeOnline(JSON.parse(JSON.stringify(wire))), snapshot);
});
