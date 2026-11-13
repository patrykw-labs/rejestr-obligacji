#!/usr/bin/env node
/*
 * Test strony w przeglądarce (Playwright): otwiera każdą zakładkę i typowe linki kalkulatora zamiany,
 * sprawdza, czy widok się wyrenderował i czy nie było błędów JavaScript.
 * Uruchom: node scripts/test_strona.js   (wymaga pakietu playwright z przeglądarką Chromium)
 */
"use strict";
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".pdf": "application/pdf" };

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
  ["#wykres", "Wykres w czasie", "main svg", "§ 2"],
  ["#seria", "Historia serii", "main table", "§ 3"],
  ["#zamiana", "Kalkulator — domyślnie", "#z-out .verdict", "§ 4"],
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
  await browser.close();
  server.close();
  console.log(`${pass} OK, ${fail} błędów`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
