#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
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
  ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".pdf": "application/pdf", ".xml": "application/atom+xml; charset=utf-8", ".woff2": "font/woff2" };

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
  ["#kupno&kw=10000&h=24", "Co kupić — 2 lata: notka o momencie wypłaty (±1 mies. wygrywa inna seria)", "#b-out .verdict", "moment wypłaty"],
  ["#kupno&kw=10000&h=60&ike=2", "Co kupić — IKZE: notka o uldze w PIT", "#b-out .verdict", "ulga w PIT nie jest liczona"],
  ["#kupno&kw=10000&h=36&sw=1&r8=1", "Co kupić — zakup za pieniądze z wykupu (cena zamiany)", "#b-out .verdict", "bez ceny zamiany — zakup po 100 zł"],
  ["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12&ike=2", "Kalkulator — IKZE: notka o uldze w PIT", "#z-out .verdict", "kosztuje naprawdę 8800 zł"],
  ["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12", "Kalkulator — EDO", "#z-out .verdict", "Jak to policzono"],
  ["#zamiana&k=XXX9999&n=10&tt=EDO&bd=12", "Kalkulator — nieznana seria w linku: komunikat", "main .insight.warn", "Seria XXX9999 nie występuje w archiwum"],
  ["#kupno&kw=1000000000&h=30", "Co kupić — kwota i okres spoza zakresu: komunikat", "main .insight.warn", "nie wszystko z linku dało się wczytać"],
  ["#portfel&pf=EDO0434~100~15,ABC1234~5&bd=12", "Mój portfel — nieznana seria w linku: komunikat", "main .insight.warn", "ABC1234"],
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
  // czcionka z własnego serwera: wczytana Plus Jakarta Sans, żadnych żądań do serwerów czcionek Google
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const ext = [];
    page.on("request", (r) => { if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) ext.push(r.url()); });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      await page.goto(base + "#oferta");
      await page.waitForSelector("main table");
      const ok = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 16px "Plus Jakarta Sans"', "Zażółć gęślą jaźń"); });
      if (!ok) problem = "czcionka Plus Jakarta Sans nie wczytała się z assets/fonts";
      if (ext.length) problem = "żądania do Google Fonts: " + ext[0];
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (problem) { fail++; console.log("✗ czcionki: " + problem); } else pass++;
    await ctx.close();
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
    for (const sel of ["main h2", "main .desc", "main th", "main td", "main .stat .v", "main .stat .s", "nav.tabs button", "main .chip", "main .btn", "main .insight", "footer",
      "main .abar.on .ab-l", "main .abar.on .seg button:not([aria-pressed=true])", "main .abar.on .seg button[aria-pressed=true]", "main .abar.on .ab-res", "main .abar.on .ab-sum-go", "main .was", "main .rb-v .small", "main .rb-note", "main .range-ends", "main .seg-f button[aria-pressed=true]", "main .seg-f button:not([aria-pressed=true])"]) {
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
    ["#kupno", ["b-png", "b-csv"]], ["#portfel&pf=EDO0434~100~15,COI1129~50~20&bd=12", ["p-csv", "p-ics"]]];
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
        if (id.endsWith("ics")) {
          const t = buf.toString("utf8"), lines = t.split("\r\n");
          if (!t.startsWith("BEGIN:VCALENDAR\r\n") || !t.trimEnd().endsWith("END:VCALENDAR")) problem = "plik .ics bez VCALENDAR";
          else if (lines.some((l) => Buffer.byteLength(l, "utf8") > 75)) problem = "wiersz .ics dłuższy niż 75 bajtów";
          else if ((t.match(/BEGIN:VEVENT/g) || []).length < 5 || !/Wykup|wykup/.test(t) || !/BEGIN:VALARM/.test(t)) problem = "za mało wydarzeń w .ics albo brak wykupu/przypomnienia";
          else if (/\n(?!\s)/.test(t.replace(/\r\n/g, ""))) problem = "znak nowej linii bez CR w .ics";
        }
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
      if (!(await page.$("#p-store .pf-flash"))) problem = "brak mignięcia „✓ Zapisano” po zmianie";
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
  // skrót do wyniku: pasek widoczny, gdy werdykt jest poniżej ekranu; kliknięcie przewija do wyniku i pasek znika
  // reducedMotion: strona przewija wtedy bez animacji, więc pomiar nie zależy od szybkości maszyny (w CI płynne przewijanie trwało)
  for (const [hash, out] of [["#zamiana&k=EDO0434&n=100&tt=EDO&bd=12", "#z-out"], ["#kupno", "#b-out"]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      await page.goto(base + hash);
      await page.waitForSelector(out + " .verdict");
      await page.waitForSelector("#peek:not([hidden])", { timeout: 5000 });
      await page.click("#peek");
      await page.waitForSelector("#peek[hidden]", { state: "attached", timeout: 5000 });
      await page.waitForFunction(() => new Promise((ok) => { const y = scrollY; setTimeout(() => ok(scrollY === y), 150); }), null, { timeout: 5000 });
      const [top, atEnd] = await page.evaluate((s) => [document.querySelector(s + " .verdict").getBoundingClientRect().top,
        Math.ceil(scrollY + innerHeight) >= document.documentElement.scrollHeight - 2], out);
      if (top < -5 || (top > 300 && !atEnd)) problem = `po kliknięciu werdykt nie jest na górze ekranu (top ${Math.round(top)})`;
      await page.click("#tab-oferta");
      if (await page.$("#peek")) problem = "pasek zostaje po zmianie zakładki";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (problem) { fail++; console.log(`✗ skrót do wyniku ${hash}: ${problem}`); } else pass++;
    await ctx.close();
  }
  // wersja strony: bez sieci — wydanie z CHANGELOG.md; z odpowiedzią API GitHuba — commity po wydaniu i skrót commita
  for (const [label, mock, re] of [["bez API", false, /^wersja v\d+\.\d+\.\d+\+?$/], ["z API", true, /^wersja v\d+\.\d+\.\d+ \+2 · abcdef1$/]]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (mock) await page.route(/^https:\/\/api\.github\.com\//, (r) => r.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify(/compare/.test(r.request().url()) ? { ahead_by: 2 } : { object: { sha: "abcdef1234567890" } }) }));
    let problem = null;
    try {
      await page.goto(base + "#oferta");
      await page.waitForSelector("#ver-foot:not([hidden])", { timeout: 10000 });
      const [foot, top, vis] = await page.evaluate(() => [document.querySelector("#ver-foot a").textContent, document.querySelector("#ver").textContent, !document.querySelector("#ver").hidden]);
      if (!re.test(foot)) problem = "stopka: " + foot;
      else if (!vis || "wersja " + top !== foot) problem = "pasek górny: " + top;
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (problem) { fail++; console.log(`✗ wersja strony (${label}): ${problem}`); } else pass++;
    await ctx.close();
  }
  // wykres: miara „Faktyczne oprocentowanie 2. roku” — zgodna z silnikiem (Zamiana.periodRates), bez błędów JS
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      await page.goto(base + "#wykres");
      await page.waitForSelector("#chart svg");
      await page.selectOption("#sel-mode", "year2");
      await page.waitForSelector("#chart svg path");
      const bad = await page.evaluate(() => {
        const out = [], cpiAt = Zamiana.makeCpiAt(calcCpiHist(), [0], "2100-01"), nbpAt = Zamiana.makeNbpAt(Zamiana.nbpHistoryFromMonths(state.raw), null, "2100-01");
        for (const [ym, k] of [["2022-01", "EDO"], ["2021-03", "COI"], ["2023-05", "ROD"], ["2022-08", "TOS"], ["2023-01", "DOR"], ["2019-04", "DOS"]]) {
          const m = state.months.find((x) => x.id === ym), s = m.series[k], v = chartVal(m, k);
          const ref = Math.round(Zamiana.periodRates({ type: k, rate1: s.rate1, margin: s.margin || 0, purchase: ym }, cpiAt, nbpAt).slice(k === "DOR" ? 12 : 1, k === "DOR" ? 24 : 2).reduce((a, b) => a + b, 0) / (k === "DOR" ? 12 : 1) * 10000) / 100;
          if (v == null || Math.abs(v - ref) > 0.006) out.push(`${k} ${ym}: wykres ${v}, silnik ${ref}`);
        }
        const last = state.months[state.months.length - 1];
        if (chartVal(last, "EDO") !== null || chartVal(last, "OTS") !== null) out.push("seria z bieżącego miesiąca albo OTS ma punkt");
        return out;
      });
      if (bad.length) problem = bad.join("; ");
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    if (problem) { fail++; console.log("✗ wykres — oprocentowanie 2. roku: " + problem); } else pass++;
    await ctx.close();
  }
  // zakładki z klawiatury: strzałka w prawo przełącza widok, aktywna zakładka ma tabindex 0
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    let problem = null;
    try {
      await page.goto(base + "#oferta");
      await page.waitForSelector("main table");
      await page.focus("#tab-oferta");
      await page.keyboard.press("ArrowRight");
      await page.waitForSelector("main svg");
      const st = await page.evaluate(() => [document.activeElement.id, document.querySelector("#tab-wykres").tabIndex, document.querySelector("#tab-oferta").tabIndex, document.querySelector("#main").getAttribute("aria-labelledby")]);
      if (st.join() !== "tab-wykres,0,-1,tab-wykres") problem = "stan zakładek po strzałce: " + st.join();
      await page.keyboard.press("End");
      if (await page.evaluate(() => document.activeElement.id) !== "tab-portfel") problem = "End nie przechodzi do ostatniej zakładki";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (problem) { fail++; console.log("✗ zakładki z klawiatury: " + problem); } else pass++;
    await ctx.close();
  }
  // Mój portfel: zapis do pliku .json i wczytanie w innej przeglądarce (z nierozpoznaną serią), „Cofnij” po wczytaniu
  {
    let problem = null, fileText = null;
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const pa = await ctxA.newPage();
    await pa.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      await pa.goto(base + "#portfel&pf=TOS1127~15,COI1129~5~20&bd=12&ike=1&sc=high");
      await pa.waitForSelector("#p-json");
      const [d] = await Promise.all([pa.waitForEvent("download"), pa.click("#p-json")]);
      fileText = fs.readFileSync(await d.path(), "utf8");
      const j = JSON.parse(fileText);
      if (j.app !== "rejestr-obligacji" || j.pos.length !== 2 || j.acc !== "ike" || j.sc !== "high" || j.pos[1].pd !== 20) problem = "zły plik portfela: " + fileText;
    } catch (e) { problem = e.message.split("\n")[0]; }
    await ctxA.close();
    if (!problem) {
      const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const pb = await ctxB.newPage();
      const errors = [];
      pb.on("pageerror", (e) => errors.push(e.message));
      await pb.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
      try {
        await pb.goto(base + "#portfel");
        await pb.waitForSelector("#p-out .stats");
        const j = JSON.parse(fileText); j.pos.push({ code: "ABC1234", n: 3, pd: 1 });
        await pb.setInputFiles("#p-file", { name: "portfel.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(j)) });
        await pb.waitForSelector("#p-import-undo");
        const h = await pb.evaluate(() => location.hash), msg = await pb.textContent("main .insight");
        if (!/pf=TOS1127~15,COI1129~5~20/.test(h) || !/ike=1/.test(h) || !/sc=high/.test(h)) problem = "portfel po wczytaniu: " + h;
        else if (!/ABC1234/.test(msg)) problem = "brak informacji o pominiętej serii";
        else if (!/TOS1127/.test(await pb.evaluate(() => localStorage.getItem("rejestr-obligacji:portfel") || ""))) problem = "wczytany portfel nie zapisał się w przeglądarce";
        await pb.click("#p-import-undo");
        await pb.waitForSelector("#p-out .stats");
        if (/TOS1127/.test(await pb.evaluate(() => location.hash))) problem = "„Cofnij” nie przywróciło portfela sprzed wczytania";
        await pb.setInputFiles("#p-file", { name: "zly.json", mimeType: "application/json", buffer: Buffer.from("to nie json") });
        await pb.waitForSelector("text=nie udało się wczytać");
      } catch (e) { problem = e.message.split("\n")[0]; }
      if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
      await ctxB.close();
    }
    if (problem) { fail++; console.log("✗ portfel — plik .json: " + problem); } else pass++;
  }
  // „Mój portfel”: tabela wklejona z rachunku (eksport „Stan rachunku rejestrowego”), plik HTML z tabelą, plik Excela; telefon
  {
    let problem = "";
    const REG = "EMISJA\tDOSTĘPNA LICZBA OBLIGACJI\tZABLOKOWANA LICZBA OBLIGACJI\tWARTOŚĆ NOMINALNA\tWARTOŚĆ AKTUALNA\tDATA WYKUPU\n" +
      "EDO1036\t200\t0\t20 000,00\t\t2036-10-16\nEDO1136\t24\t0\t2 400,00\t\t2036-11-03\nROD1038\t126\t0\t12 600,00\t\t2038-10-05\n" +
      "ROD1138\t16\t0\t1 600,00\t\t2038-11-03\nXYZ1234\t5\t0\n";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      await pg.goto(base + "#portfel");
      await pg.waitForSelector("#p-out .stats");
      await pg.click("#p-paste-open");
      await pg.fill("#p-paste", REG);
      const prev = await pg.textContent("#p-paste-prev");
      const wide = await pg.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      await pg.fill("#p-paste", REG.replace("12 600,00", "12 690,00"));
      if (!/sprawdź przed wczytaniem[\s\S]*ROD1038: 126 szt\., a wartość nominalna 12 690,00 zł/.test(await pg.textContent("#p-paste-prev"))) problem = "brak ostrzeżenia o wartości nominalnej w podglądzie";
      await pg.fill("#p-paste", REG);
      if (problem) {}
      else if (!/Rozpoznano 4 serie/.test(prev) || !/EDO1036 × 200 szt\. · zakup 16\.10\.2026/.test(prev) || !/XYZ/.test(prev)) problem = "podgląd wklejonej tabeli: " + prev;
      else if (wide) problem = "pole wklejania: poziome przewijanie na telefonie";
      else {
        await pg.click("#p-paste-ok");
        await pg.waitForSelector("#p-import-undo");
        const h = await pg.evaluate(() => location.hash);
        if (!/pf=EDO1036~200~16,EDO1136~24~3,ROD1038~126~5,ROD1138~16~3(&|$)/.test(h)) problem = "portfel po wklejeniu: " + h;
        else if (await pg.$("#p-paste")) problem = "pole wklejania nie zamknęło się po wczytaniu";
        else {
          await pg.click("#p-import-undo");
          await pg.waitForSelector("#p-out .stats");
          if (/EDO1036~200/.test(await pg.evaluate(() => location.hash))) problem = "„Cofnij” po wklejeniu nie przywróciło portfela";
          const html = "<html><body><table><tr><th>EMISJA</th><th>DOSTĘPNA LICZBA OBLIGACJI</th><th>ZABLOKOWANA LICZBA OBLIGACJI</th><th>DATA WYKUPU</th></tr>" +
            "<tr><td>EDO1036</td><td>7</td><td>1</td><td>2036-10-16</td></tr></table></body></html>";
          await pg.setInputFiles("#p-file", { name: "stan.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from(html) });
          await pg.waitForSelector("#p-import-undo");
          if (!problem && !/pf=EDO1036~8~16(&|$)/.test(await pg.evaluate(() => location.hash))) problem = "plik z tabelą HTML: " + await pg.evaluate(() => location.hash);
          await pg.setInputFiles("#p-file", { name: "stan.xls", mimeType: "application/vnd.ms-excel", buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]) });
          await pg.waitForSelector("text=Wklej z rachunku”");
          // seria z bieżącego miesiąca: na liście serii, a zakup po dniu wyceny → komunikat zamiast wyniku
          const mj = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "months.json"), "utf8"));
          const cur = mj[Object.keys(mj).sort().pop()].series.EDO.code;
          await pg.goto("about:blank");
          await pg.goto(base + `#portfel&pf=${cur}~10~20&bd=16`);
          await pg.waitForSelector("text=po dniu wyceny");
          if (!(await pg.$(`select[data-pk=code] option[value=${cur}]:not([selected])`)) && !(await pg.$eval("select[data-pk=code]", (e) => e.selectedOptions[0].textContent)).includes("zakup"))
            problem = `seria z bieżącego miesiąca (${cur}) bez opisu na liście serii`;
          // okno przedterminowego wykupu: 7 dni po zakupie i 20 dni przed wykupem — komunikat zamiast kwoty, poza sumą
          const last = Object.keys(mj).sort().pop(), [ly, lm] = last.split("-").map(Number);
          const nx = lm === 12 ? [ly + 1, 1] : [ly, lm + 1], coiSoon = `COI${String(nx[1]).padStart(2, "0")}${String(nx[0]).slice(2)}`;
          await pg.goto("about:blank");
          await pg.goto(base + `#portfel&pf=${coiSoon}~10~5,${cur}~10~15,EDO0434~100~15&bd=20`);
          await pg.waitForSelector("#p-out .stats");
          const pt = await pg.$eval("#p-out", (e) => e.innerText);
          if (!problem && !(/nie można dziś zerwać/.test(pt) && /mniej niż 20 dni do wykupu/.test(pt) && /zerwanie możliwe od 23\./.test(pt)))
            problem = `okno wykupu w portfelu (${coiSoon}, ${cur}): brak komunikatów`;
          if (!problem && !new RegExp(`bez ${coiSoon}, ${cur}`).test(pt)) problem = "okno wykupu: serie nie wyłączone z sumy";
          await pg.goto("about:blank");
          await pg.goto(base + `#zamiana&k=${coiSoon}&n=10&pd=5&tt=EDO&bd=20`);
          await pg.waitForSelector("#z-out .verdict");
          if (!problem && !/nie można zerwać dziś[\s\S]*Poczekaj na wykup w terminie/.test(await pg.$eval("#z-out", (e) => e.innerText)))
            problem = `okno wykupu w kalkulatorze (${coiSoon}): brak ostrzeżenia`;
        }
      }
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    await ctx.close();
    if (problem) { fail++; console.log("✗ portfel — wklejanie z rachunku: " + problem); } else pass++;
  }
  // link wklejony do już otwartej karty (zmiana tylko po „#”, bez przeładowania) — widok czyta adres od nowa
  {
    let problem = "";
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      await pg.goto(base + "#portfel");
      await pg.waitForSelector("#p-out .stats");
      await pg.evaluate(() => { location.hash = "#kupno&kw=7300&h=36"; });
      await pg.waitForSelector("#b-out .verdict");
      if ((await pg.inputValue("#b-kw")) !== "7300") problem = "„Co kupić” nie wczytało kwoty z nowego adresu";
      await pg.evaluate(() => { location.hash = "#portfel&pf=TOS1127~15&bd=12"; });
      await pg.waitForSelector("#p-out .stats");
      const v = await pg.$eval("select[data-pk=code]", (e) => e.value), store = await pg.textContent("#p-store");
      if (!problem && (v !== "TOS1127" || !/otwarto z linku/.test(store))) problem = `portfel z nowego adresu: ${v}, ${store}`;
      await pg.evaluate(() => { location.hash = "#seria&s=COI&w=1"; });
      await pg.waitForFunction(() => /COI/.test(document.querySelector("main h2")?.textContent || ""));
      if (!problem && !/s=COI&w=1/.test(await pg.evaluate(() => location.hash))) problem = "Historia serii: adres po odczycie " + await pg.evaluate(() => location.hash);
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    await ctx.close();
    if (problem) { fail++; console.log("✗ link wklejony do otwartej karty: " + problem); } else pass++;
  }
  // pasek założeń: po przewinięciu pod formularz przyklejony pod nagłówkiem; zmiana rachunku w pasku przelicza wynik
  // (plakietka „było …”), zmienia adres, nie przewija strony i zostawia fokus; wybór przechodzi do innych zakładek, a link
  // wklejony do karty ma pierwszeństwo; kontrast w obu motywach; telefon — linijka podsumowania i panel od dołu (Esc, fokus)
  for (const scheme of ["light", "dark"]) {
    let problem = "";
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      await pg.goto(base + "#zamiana");
      await pg.waitForSelector("#z-out .verdict");
      if (await pg.$eval("#z-abar", (e) => e.classList.contains("on"))) problem = "pasek widoczny nad formularzem";
      await pg.evaluate(() => scrollTo(0, document.querySelector("#z-chart").getBoundingClientRect().top + scrollY - 250));
      await pg.waitForSelector("#z-abar.on", { timeout: 3000 });
      const y0 = await pg.evaluate(() => scrollY);
      await pg.click('#z-abar [data-ab="acc"][data-v="ike"]');
      const st = await pg.evaluate(() => ({ h: location.hash, y: scrollY, on: document.querySelector("#z-abar").classList.contains("on"),
        was: document.querySelectorAll("#main .was").length, f: document.activeElement?.dataset?.v, res: document.querySelector("#z-abar .ab-res").textContent }));
      if (!problem && !/ike=1/.test(st.h)) problem = "pasek: rachunek nie zmienił adresu " + st.h;
      if (!problem && (Math.abs(st.y - y0) > 2 || !st.on)) problem = `pasek: strona przewinęła się (${y0} → ${st.y}) albo pasek zniknął`;
      if (!problem && (!st.was || !/było/.test(st.res))) problem = "pasek: brak plakietki „było …” po zmianie";
      if (!problem && st.f !== "ike") problem = "pasek: fokus nie wrócił na wybraną opcję";
      const c = await contrastCheck(pg, 4.5);
      if (!problem && c.bad.length) problem = "pasek: za słaby kontrast: " + c.bad.join(", ");
      await pg.click("#tab-kupno");
      await pg.waitForSelector("#b-out .verdict");
      if (!problem && (await pg.$eval('button[data-bacc][aria-pressed="true"]', (e) => e.dataset.bacc)) !== "ike") problem = "IKE nie przeszło do „Co kupić?”";
      await pg.click('button.chip[data-bsc="high"]');
      await pg.click("#tab-portfel");
      await pg.waitForSelector("#p-out .stats");
      const pf = await pg.evaluate(() => [document.querySelector('button[data-pacc][aria-pressed="true"]').dataset.pacc, document.querySelector('button.chip[data-psc][aria-pressed="true"]').dataset.psc]);
      if (!problem && pf.join() !== "ike,high") problem = "rachunek/inflacja nie przeszły do portfela: " + pf.join();
      await pg.evaluate(() => { location.hash = "#kupno&kw=5000&h=36&sc=base&ike=0"; });
      await pg.waitForFunction(() => document.querySelector("#b-kw")?.value === "5000");
      if (!problem && (await pg.$eval('button[data-bacc][aria-pressed="true"]', (e) => e.dataset.bacc)) !== "std") problem = "link z ike=0 nie ma pierwszeństwa przed wspólnymi założeniami";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    await ctx.close();
    if (problem) { fail++; console.log(`✗ pasek założeń (${scheme === "dark" ? "ciemny" : "jasny"} motyw): ${problem}`); } else pass++;
  }
  // etap 2: pasek pojawia się, zanim dół formularza schowa się pod nagłówkiem; „Co kupić?” — słupki zysku z konturem zwykłego
  // rachunku przy IKE (bez konturu na zwykłym), suwaki okresu i kwoty, przełącznik wyceny; kalkulator — linia różnicy na zwykłym
  // rachunku przy IKE i zdanie w werdykcie
  for (const scheme of ["light", "dark"]) {
    let problem = "";
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      await pg.goto(base + "#kupno&kw=10000&h=60&sc=base&sv=4&ike=1");
      await pg.waitForSelector("#b-out .rbars");
      await pg.evaluate(() => scrollTo(0, document.querySelector("#b-out").getBoundingClientRect().top + scrollY - 59 - 100));
      await pg.waitForTimeout(250);
      if (!(await pg.$eval("#b-abar", (e) => e.classList.contains("on")))) problem = "pasek nie pojawia się, gdy z formularza zostało ~40 px nad wynikiem";
      const rows = await pg.$$eval("#b-out .rbar", (r) => r.length), ghosts = await pg.$$eval("#b-out .rb-ghost", (r) => r.length);
      if (!problem && (!rows || rows !== ghosts)) problem = `słupki: ${rows} serii, ${ghosts} konturów zwykłego rachunku`;
      const c = await contrastCheck(pg, 4.5);
      if (!problem && c.bad.length) problem = "za słaby kontrast: " + c.bad.join(", ");
      await pg.evaluate(() => scrollTo(0, 0));
      await pg.focus("#b-h"); await pg.keyboard.press("ArrowRight");
      await pg.waitForFunction(() => /h=72/.test(location.hash));
      if (!problem && (await pg.textContent("#b-h-v")) !== "6 lat") problem = "suwak okresu: etykieta " + await pg.textContent("#b-h-v");
      await pg.focus("#b-kw-r"); await pg.keyboard.press("ArrowRight");
      await pg.waitForFunction(() => /kw=15000/.test(location.hash));
      if (!problem && (await pg.inputValue("#b-kw")) !== "15000") problem = "suwak kwoty nie zmienił pola";
      if (!problem && !(await pg.$$eval("#main .was", (w) => w.length))) problem = "suwak: brak plakietki „było …” po zmianie";
      await pg.click('.calc-grid button[data-bval="h"]');
      await pg.waitForFunction(() => /val=h/.test(location.hash));
      await pg.click('.calc-grid button[data-bacc="std"]');
      await pg.waitForSelector("#b-out .rbars");
      if (!problem && await pg.$("#b-out .rb-ghost")) problem = "kontur zwykłego rachunku przy zwykłym rachunku";
      await pg.goto("about:blank");
      await pg.goto(base + "#zamiana&k=EDO0434&n=100&tt=EDO&bd=12&ike=1");
      await pg.waitForSelector("#z-chart svg");
      if (!problem && !(await pg.$("#z-chart .zghost"))) problem = "kalkulator: brak linii różnicy na zwykłym rachunku przy IKE";
      if (!problem && !/Na zwykłym rachunku/.test(await pg.textContent("#z-out .verdict"))) problem = "kalkulator: brak zdania o zwykłym rachunku w werdykcie";
      await pg.click('.calc-grid button[data-val="liquidate"]');
      await pg.waitForFunction(() => /val=l/.test(location.hash));
      await pg.click('.calc-grid button[data-acc="std"]');
      await pg.waitForSelector("#z-chart svg");
      if (!problem && await pg.$("#z-chart .zghost")) problem = "kalkulator: linia zwykłego rachunku przy zwykłym rachunku";
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    await ctx.close();
    if (problem) { fail++; console.log(`✗ porównanie ze zwykłym rachunkiem, suwaki (${scheme === "dark" ? "ciemny" : "jasny"} motyw): ${problem}`); } else pass++;
  }
  {
    let problem = "";
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pg = await ctx.newPage();
    const errors = [];
    pg.on("pageerror", (e) => errors.push(e.message));
    await pg.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    try {
      for (const [hash, p, ready] of [["#kupno", "b", "#b-out .verdict"], ["#portfel", "p", "#p-out .stats"], ["#zamiana", "z", "#z-out .verdict"]]) {
        await pg.goto("about:blank");
        await pg.goto(base + hash);
        await pg.waitForSelector(ready);
        await pg.evaluate((r) => scrollTo(0, document.querySelector(r).getBoundingClientRect().bottom + scrollY), ready);
        await pg.waitForSelector(`#${p}-abar.on .ab-sum`, { timeout: 3000 });
        if (await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth) > 1) { problem = `${hash}: pasek poszerza stronę`; break; }
        if (p !== "b") continue;
        await pg.tap("#b-abar .ab-sum");
        if (await pg.$eval("#b-asheet", (e) => e.hidden || !e.contains(document.activeElement))) { problem = "panel się nie otworzył albo fokus poza panelem"; break; }
        await pg.tap('#b-asheet [data-ab="acc"][data-v="ikze"]');
        const st = await pg.evaluate(() => ({ open: !document.querySelector("#b-asheet").hidden, h: location.hash, was: document.querySelectorAll("#main .was").length }));
        if (!st.open || !/ike=2/.test(st.h) || !st.was) { problem = `panel po wyborze IKZE: ${JSON.stringify(st)}`; break; }
        await pg.keyboard.press("Escape");
        if (!(await pg.evaluate(() => document.querySelector("#b-asheet").hidden && document.activeElement?.classList.contains("ab-sum")))) { problem = "Esc nie zamknął panelu albo fokus nie wrócił na „Zmień”"; break; }
      }
    } catch (e) { problem = e.message.split("\n")[0]; }
    if (errors.length) problem = (problem ? problem + "; " : "") + "błędy JS: " + errors.join(" | ");
    await ctx.close();
    if (problem) { fail++; console.log("✗ pasek założeń (telefon): " + problem); } else pass++;
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
