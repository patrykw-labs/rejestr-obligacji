#!/usr/bin/env node
/*
 * Test strony w przeglądarce (Playwright): otwiera każdą zakładkę i typowe linki kalkulatora zamiany,
 * sprawdza, czy widok się wyrenderował i czy nie było błędów JavaScript; także ciemny motyw (kontrast,
 * przełącznik, eksport PNG), eksport CSV/PNG, „Wyczyść ustawienia” i zapamiętanie portfela.
 * Uruchom: node scripts/test_strona.js   (wymaga pakietu playwright z przeglądarką Chromium)
 */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".pdf": "application/pdf", ".xml": "application/atom+xml; charset=utf-8" };

// prosty serwer plików repozytorium (bez zależności)
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

// [adres, opis, selektor, który musi się pojawić, tekst, który musi być w widoku]
const CASES = [
  ["#oferta", "Oferta miesiąca", "main table", "§ 1"],
  ["#oferta&m=2022-10", "Oferta miesiąca z adresu (link z kanału)", "main table", "październik 2022"],
  ["#wykres", "Wykres w czasie", "main svg", "§ 2"],
  ["#seria", "Historia serii", "main table", "§ 3"],
  ["#seria&w=1", "Historia serii — jak wypadła seria EDO", "main table", "pobiło"],
  ["#seria&s=COI&w=1", "Historia serii — jak wypadła seria COI", "main table", "Jak wypadła seria COI"],
  ["#seria&s=TOZ&w=1", "Historia serii — TOZ bez wyniku", "main .chips", "WIBOR6M"],
  ["#portfel", "Mój portfel — domyślnie", "#p-out .stats", "§ 6"],
  ["#portfel&pf=EDO0127~40~10,EDO0434~100~15,COI1129~50~20,DOR0627~30~5,OTS0127~10&bd=12&ike=0", "Mój portfel — kilka serii", "#p-out .stats", "Najbliższe 12 miesięcy"],
  ["#portfel&pf=ROD0137~20~3,TOS1127~15&bd=28&ike=1&sc=high", "Mój portfel — IKE, wysoka inflacja", "#p-out .stats", "bez podatku"],
  ["#zamiana", "Kalkulator — domyślnie", "#z-out .verdict", "§ 4"],
  ["#kupno", "Co kupić — domyślnie", "#b-out .verdict", "§ 5"],
  ["#kupno&kw=25000&h=36&sc=high&sv=5&ike=1&r8=1", "Co kupić — 3 lata, IKE, 800+", "#b-out .verdict", "ROD"],
  ["#kupno&kw=5000&h=6&sc=custom&cpi=3,4&val=h", "Co kupić — pół roku, bez wypłaty", "#b-out .verdict", "bez wypłaty"],
  ["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12", "Kalkulator — EDO", "#z-out .verdict", "Jak to policzono"],
  ["#zamiana&k=COI1129&n=50&tt=EDO&bd=12&ike=1", "Kalkulator — COI w IKE", "#z-out .verdict", "IKE"],
  ["#zamiana&k=DOR0627&n=30&tt=EDO&bd=12", "Kalkulator — DOR (stopa NBP)", "#z-out .verdict", "stopie referencyjnej NBP"],
  ["#zamiana&k=ROR0527&n=100&tt=ROR&bd=12", "Kalkulator — ROR na ROR", "#z-out .verdict", "ROR"],
  ["#zamiana&k=OTS1226&n=100&tt=EDO&bd=12", "Kalkulator — OTS", "#z-out .verdict", "OTS"],
  ["#zamiana&k=EDO0434&n=100&tt=OTS&bd=12&h=3", "Kalkulator — zamiana na OTS", "#z-out .verdict", "100,00 zł"],
  ["#zamiana&k=EDO0127&n=40&tt=EDO&bd=12", "Kalkulator — EDO sprzed 2019", "#z-out .verdict", "EDO0127"],
  ["#zamiana&pf=EDO0127~40~10,EDO0434~100~15,COI1129~50~20,DOR0627~30~5&tt=EDO&bd=12", "Kalkulator — portfel", "#z-out .verdict", "Serie w portfelu"],
  ["#zamiana&pf=EDO0234~20,EDO0334~23,EDO0434~34&tt=EDO&bd=12", "Kalkulator — portfel ze wspólnymi resztami", "#z-out .verdict", "połączonych reszt"],
  ["#zamiana&k=EDO0432&n=10&tt=EDO&bd=1&dm=2024-04&cm=s&h=12&sv=4&sc=base&ike=0&val=l&rr1=3", "Kalkulator — decyzja w przeszłości", "#z-out .verdict", "w dniu zerwania"],
  ["#zamiana&k=EDO0434&n=100&tt=EDO&bd=1&dm=2027-06", "Kalkulator — decyzja w przyszłości", "#z-out .verdict", "założenie"],
  ["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12&sc=custom&cpi=3,4,5", "Kalkulator — inflacja rok po roku", "#z-out .verdict", "rok 3"],
  ["#zamiana&t=EDO&p=2024-05&r1=6.8&m=1.5&f=2&n=10&tt=EDO&tc=1&tr1=5&tm=2&tf=3&bd=12", "Kalkulator — parametry ręczne", "#z-out .verdict", "własne parametry"],
];

(async () => {
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let pass = 0, fail = 0;
  for (const [hash, label, selector, text] of CASES) {
    for (const [device, ctxOpts] of [["komputer", { viewport: { width: 1280, height: 900 } }], ["telefon", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
      const ctx = await browser.newContext(ctxOpts);
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => { if (m.type() === "error" && !/goatcounter|gc\.zgo\.at|fonts\.g|net::ERR/.test(m.text())) errors.push(m.text()); });
      // zewnętrzne zasoby (licznik, czcionki) nie są potrzebne do testu
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      let problem = null;
      try {
        await page.goto(base + hash);
        await page.waitForSelector(selector, { timeout: 15000 });
        const body = await page.textContent("main");
        if (!body.includes(text)) problem = `brak tekstu „${text}”`;
        if (/Archiwum się wczytuje|Nie udało się wyświetlić/.test(body)) problem = "widok się nie wyrenderował";
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (overflow > 1) problem = `strona szersza niż ekran o ${overflow}px`;
      } catch (e) { problem = e.message.split("\n")[0]; }
      if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
      if (problem) { fail++; console.log(`✗ ${label} (${device}): ${problem}`); } else pass++;
      await ctx.close();
    }
  }
  // ciemny motyw: zakładki bez błędów i poziomego przewijania, kontrast tekstu, przełącznik motywu, eksport PNG
  const DARK = [["#oferta", "main table"], ["#seria&w=1", "main table"], ["#zamiana&pf=EDO0127~40~10,EDO0434~100~15,COI1129~50~20&tt=EDO&bd=12", "#z-out .verdict"],
    ["#kupno", "#b-out .verdict"], ["#portfel&pf=EDO0434~100~15,COI1129~50~20&bd=12", "#p-out .stats"]];
  // kontrast WCAG tekstu względem tła (pierwsze nieprzezroczyste tło w górę drzewa); wynik: lista elementów poniżej progu
  const contrastCheck = (page, min) => page.evaluate((min) => {
    const rgb = (s) => { const n = (s.match(/-?[\d.]+/g) || []).map(Number); return /^color\(srgb/.test(s) ? [n[0] * 255, n[1] * 255, n[2] * 255, n.length > 3 ? n[3] : 1] : [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; };
    const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
    const bad = [];
    for (const sel of ["main h2", "main .desc", "main th", "main td", "main .stat .v", "main .stat .s", "nav.tabs button", "main .chip", "main .btn", "main .insight", "footer"]) {
      const el = document.querySelector(sel); if (!el) continue;
      const a = lum(rgb(getComputedStyle(el).color)), b = lum(bgOf(el)), r = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (r < min) bad.push(`${sel} ${r.toFixed(2)}:1`);
    }
    return { bad, bodyLum: lum(bgOf(document.body)) };
  }, min);
  for (const [hash, ready] of DARK) {
    for (const [device, ctxOpts] of [["komputer", { viewport: { width: 1280, height: 900 } }], ["telefon", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
      const ctx = await browser.newContext(Object.assign({ colorScheme: "dark" }, ctxOpts));
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      let problem = null;
      try {
        await page.goto(base + hash);
        await page.waitForSelector(ready, { timeout: 15000 });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (overflow > 1) problem = `strona szersza niż ekran o ${overflow}px`;
        const c = await contrastCheck(page, 4.5);
        if (c.bodyLum > 0.1) problem = "ciemny motyw nie zadziałał (jasne tło)";
        else if (c.bad.length) problem = "za słaby kontrast: " + c.bad.join(", ");
      } catch (e) { problem = e.message.split("\n")[0]; }
      if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
      if (problem) { fail++; console.log(`✗ ciemny motyw ${hash} (${device}): ${problem}`); } else pass++;
      await ctx.close();
    }
  }
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      // jasny motyw: ten sam próg kontrastu
      await page.goto(base + "#zamiana&k=EDO0434&n=100&tt=EDO&bd=12");
      await page.waitForSelector("#z-out .verdict");
      const cl = await contrastCheck(page, 4.5);
      if (cl.bad.length) problem = "jasny motyw — za słaby kontrast: " + cl.bad.join(", ");
      // przełącznik: ciemny motyw zapisany w localStorage i zachowany po przeładowaniu
      await page.click("#theme-btn");
      const t1 = await page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem("theme")]);
      if (t1[0] !== "dark" || t1[1] !== "dark") problem = "przełącznik nie ustawił ciemnego motywu: " + t1.join("/");
      await page.reload();
      await page.waitForSelector("#z-out .verdict");
      const after = await contrastCheck(page, 4.5);
      if (await page.evaluate(() => document.documentElement.dataset.theme) !== "dark" || after.bodyLum > 0.1) problem = "po przeładowaniu motyw nie jest ciemny";
      // eksport PNG w ciemnym motywie: tło obrazu = --surface, sensowny rozmiar
      const png = await page.evaluate(async () => {
        const blob = await chartPngBlob(document.querySelector("#z-chart"), "test", "ciemny motyw");
        const img = await createImageBitmap(blob), cv = document.createElement("canvas");
        cv.width = img.width; cv.height = img.height; const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
        const px = Array.from(ctx.getImageData(4, 4, 1, 1).data).slice(0, 3);
        const hex = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
        const want = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
        return { size: blob.size, px, want };
      });
      if (png.size < 20000) problem = `PNG w ciemnym motywie za mały (${png.size} B)`;
      if (png.px.some((v, i) => Math.abs(v - png.want[i]) > 3)) problem = `tło PNG ${png.px} zamiast --surface ${png.want}`;
      // powrót do jasnego
      await page.click("#theme-btn");
      if (await page.evaluate(() => localStorage.getItem("theme")) !== "light") problem = "przełącznik nie wrócił do jasnego motywu";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    if (problem) { fail++; console.log("✗ motyw — przełącznik, kontrast i PNG: " + problem); } else pass++;
    await ctx.close();
  }
  // eksport: PNG wykresu i CSV tabeli (komputer) oraz kanał Atom
  const DL = [["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12", ["z-png", "z-csv"]], ["#zamiana&pf=EDO0434~100~15,COI1129~50~20&tt=EDO&bd=12", ["z-png", "z-csv"]],
    ["#kupno", ["b-png", "b-csv"]], ["#portfel&pf=EDO0434~100~15,COI1129~50~20&bd=12", ["p-csv"]]];
  for (const [hash, ids] of DL) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    for (const id of ids) {
      let problem = null;
      try {
        await page.goto(base + hash);
        await page.waitForSelector("#" + id, { timeout: 15000 });
        const [d] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.click("#" + id)]);
        const buf = fs.readFileSync(await d.path());
        if (id.endsWith("png") && buf.slice(1, 4).toString() !== "PNG") problem = "plik nie jest PNG";
        if (id.endsWith("png") && buf.length < 20000) problem = `PNG za mały (${buf.length} B)`;
        if (id.endsWith("csv") && !(buf[0] === 0xef && buf.toString("utf8").split("\n").length > 3 && buf.toString("utf8").includes(";"))) problem = "zły CSV";
      } catch (e) { problem = e.message.split("\n")[0]; }
      if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
      if (problem) { fail++; console.log(`✗ eksport ${id} (${hash}): ${problem}`); } else pass++;
    }
    await ctx.close();
  }
  // „Wyczyść ustawienia” przywraca stan domyślny, „Cofnij” — poprzedni (kalkulator, Co kupić?, Mój portfel)
  const RESET = [["#zamiana&pf=EDO0127~40~10,EDO0434~100~15&tt=EDO&bd=12&sc=high", "z", "#z-out .verdict", /pf=EDO0127~40~10,EDO0434~100~15.*sc=high/],
    ["#kupno&kw=25000&h=36&sc=high&sv=5&ike=1&r8=1", "b", "#b-out .verdict", /kw=25000&h=36&sc=high/],
    ["#portfel&pf=ROD0137~20~3,TOS1127~15&bd=28&ike=1&sc=high", "p", "#p-out .stats", /pf=ROD0137~20~3,TOS1127~15.*ike=1&sc=high/]];
  for (const [hash, p, ready, keep] of RESET) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      await page.goto(base + hash);
      await page.waitForSelector(ready);
      await page.click(`#${p}-reset`);
      await page.waitForSelector(`#${p}-undo`);
      const h1 = await page.evaluate(() => location.hash);
      if (keep.test(h1)) problem = "po wyczyszczeniu adres ma stare ustawienia: " + h1;
      if (!(await page.isDisabled(`#${p}-reset`))) problem = "po wyczyszczeniu przycisk powinien być nieaktywny";
      await page.click(`#${p}-undo`);
      await page.waitForSelector(ready);
      const h2 = await page.evaluate(() => location.hash);
      if (!keep.test(h2)) problem = "cofnięcie nie przywróciło ustawień: " + h2;
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    if (problem) { fail++; console.log(`✗ reset ${p}: ${problem}`); } else pass++;
    await ctx.close();
  }
  // Mój portfel: zapamiętanie w przeglądarce (localStorage); link z parametrami nie nadpisuje zapisanego portfela
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const open = async (h) => { await page.goto("about:blank"); await page.goto(base + h); await page.waitForSelector("#p-out .stats"); };
    const saved = () => page.evaluate(() => localStorage.getItem("rejestr-obligacji:portfel") || "");
    let problem = null;
    try {
      await open("#portfel&pf=TOS1127~15&bd=28");
      if (await saved()) problem = "portfel z linku zapisał się bez zgody";
      await page.click("#p-keep");
      if (!/TOS1127/.test(await saved())) problem = "„Zapamiętaj ten portfel” nie zapisał portfela";
      await page.fill('input[data-pi="0"][data-pk="n"]', "20");
      await page.waitForTimeout(200);
      if (!/"n":"?20/.test(await saved())) problem = "zmiana liczby sztuk nie trafiła do zapisu";
      await open("#portfel");
      if (!/pf=TOS1127~20/.test(await page.evaluate(() => location.hash))) problem = "zapisany portfel nie wczytał się przy wejściu bez parametrów";
      await open("#portfel&pf=EDO0434~10");
      if (!/TOS1127/.test(await saved()) || /EDO0434/.test(await saved())) problem = "link z parametrami nadpisał zapisany portfel";
      await page.click("#p-load");
      await page.waitForSelector("#p-out .stats");
      if (!/pf=TOS1127~20/.test(await page.evaluate(() => location.hash))) problem = "„Wczytaj zapamiętany” nie przywrócił portfela";
      await page.click("#p-forget");
      await page.waitForSelector("#p-undo");
      if (await saved()) problem = "„Zapomnij portfel” nie usunął zapisu";
      await page.click("#p-undo");
      await page.waitForSelector("#p-out .stats");
      if (!/TOS1127/.test(await saved())) problem = "„Cofnij” po zapomnieniu nie przywrócił zapisu";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    if (problem) { fail++; console.log("✗ portfel — zapis w przeglądarce: " + problem); } else pass++;
    await ctx.close();
  }
  try {
    const xml = await (await fetch(base + "feed.xml")).text();
    if (/<feed[\s>]/.test(xml) && (xml.match(/<entry>/g) || []).length >= 12) pass++; else { fail++; console.log("✗ feed.xml: brak wpisów"); }
  } catch (e) { fail++; console.log("✗ feed.xml: " + e.message); }
  await browser.close();
  server.close();
  console.log(`${pass} OK, ${fail} błędów`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
