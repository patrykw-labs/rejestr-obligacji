#!/usr/bin/env node
/* Testy silnika kalkulatora zamiany (js/zamiana.js). Uruchom: node scripts/test_zamiana.js */
"use strict";
const path = require("path");
const fs = require("fs");
const Z = require(path.join(__dirname, "..", "js", "zamiana.js"));
const r2 = (x) => Math.round(x * 100) / 100;

let pass = 0, fail = 0;
function eq(name, got, exp, tol = 0.01) {
  const ok = typeof exp === "number" ? Math.abs(got - exp) <= tol : JSON.stringify(got) === JSON.stringify(exp);
  if (ok) pass++; else { fail++; console.log(`✗ ${name}: oczekiwano ${JSON.stringify(exp)}, jest ${JSON.stringify(got)}`); }
}

// ---------------------------------------------------------------------------
// 1. Zgodność z niezależnym arkuszem kontrolnym (scenariusz zamiany EDO na EDO)
//    252 szt. „starego EDO” z 04.2022 (2,70% / marża 1,25%, opłata 2 zł),
//    CPI dla okresów: 18,4% (II 2023), 2,8% (II 2024), dalej 2,5%; konto 4%; podatek 19%.
//    Arkusz nie zaokrągla wartości do groszy na sztukę i liczy podatek od 100 zł.
// ---------------------------------------------------------------------------
const ref = {
  old: { type: "EDO", rate1: 2.7, margin: 1.25, fee: 2, purchase: "2022-04", count: 252 },
  target: { type: "EDO", rate1: 6.8, margin: 1.5, fee: 2 },
  rollover: { type: "EDO", rate1: 3.0, margin: 1.5, fee: 2 },
  cpiHistory: { "2023-02": 18.4, "2024-02": 2.8 },
  cpiFuture: [2.5], savingsRate: 4, tax: true,
  roundPerBond: false, taxBasisNominal: true, valuation: "liquidate",
};
// wartość „trzymam” (kolumna AB) według wieku starego EDO
const keepFromStart = Z.compare(Object.assign({}, ref, { now: "2022-04", horizonMonths: 122 })).months;
const expKeep = { 1: 25200, 11: 25296.957, 12: 25342.884, 13: 25686.1551555, 23: 29118.8667105,
  24: 29462.137866, 25: 29546.7908913, 36: 30477.9741696, 37: 30559.5310889, 48: 31456.6572009,
  50: 31625.8878084, 121: 38596.4851523, 122: 38596.7456622 };
for (const [age, v] of Object.entries(expKeep)) eq(`arkusz: trzymam, wiek ${age}`, keepFromStart[+age].keep, v);

// zamiana po 24 miesiącach (kolumny AH–AT)
const sw = Z.compare(Object.assign({}, ref, { now: "2024-04", horizonMonths: 30 }));
eq("arkusz: liczba nowych obligacji", sw.switchNow.newCount, 294);
eq("arkusz: reszta na konto", sw.switchNow.cashRest, 62.137866);
const expSwap = { 1: 29462.3056382, 2: 29462.4738635, 12: 30607.2533006, 13: 30692.2044301, 24: 31626.6980145,
  25: 31715.0459564, 26: 31803.3943814 };
for (const [t, v] of Object.entries(expSwap)) eq(`arkusz: zamiana, miesiąc ${t}`, sw.months[+t].swap, v);
eq("arkusz: trzymam w tym samym czasie (wiek 50)", sw.months[26].keep, 31625.8878084);
eq("arkusz: różnica po 26 mies.", sw.months[26].diff, 31803.3943814 - 31625.8878084);

// Scenariusz kontrolny (10 szt., CPI 2,5%, konto 4%): „po pierwszym roku zamiany 5 zł zysku,
// po kolejnym 6 zł”, a w roku wykupu starej serii przewaga znika.
const scen = Z.compare(Object.assign({}, ref, { old: Object.assign({}, ref.old, { count: 10 }), now: "2024-04", horizonMonths: 96 }));
eq("scen: +5 zł po roku", Math.round(scen.months[12].diff), 5, 0);
eq("scen: +6 zł po 2 latach", Math.round(scen.months[24].diff), 6, 0);
eq("scen: w roku wykupu starej serii przewaga znika", Math.abs(scen.months[96].diff) < 5, true);

// ---------------------------------------------------------------------------
// 1b. Wycena „trzymam” (domyślna): jedyne zerwanie to zamiana dziś, bez przyszłych opłat
// ---------------------------------------------------------------------------
const hold = Z.compare(Object.assign({}, ref, { valuation: "hold", now: "2024-04", horizonMonths: undefined }));
eq("hold: domyślny horyzont = do wykupu starej serii", hold.horizonMonths, 96);
eq("hold: wykup starej serii", hold.maturity, "2032-04");
// dziś: różnica = −opłata·(1 − 19%) — opłata pomniejsza też zysk do opodatkowania
eq("hold: różnica dziś = −opłata po podatku", hold.months[0].diff, -504 * 0.81, 0.01);
// w miesiącu wykupu „trzymam” = kwota na rękę z wykupu (bez opłaty), zamieniona po 99,90 + reszta
const keepAtMat = Z.compare(Object.assign({}, ref, { valuation: "liquidate", now: "2024-04", horizonMonths: 96 })).months[96].keep;
eq("hold: w terminie wykupu wartość jak przy wypłacie", Math.abs(hold.months[96].keep - keepAtMat) < 50, true);

// historia od zakupu: start = 100 zł/szt., ostatni punkt = wartość „trzymam” dziś
eq("historia: miesiąc zakupu", hold.past[0].ym, "2022-04");
eq("historia: wartość przy zakupie", hold.past[0].value, 25200);
eq("historia: długość = wiek + 1", hold.past.length, 25);
eq("historia łączy się z „dziś”", hold.past[hold.past.length - 1].value, hold.months[0].keep, 0.01);

// ---------------------------------------------------------------------------
// 2. Zasady z listów emisyjnych (domyślnie: zaokrąglenie do groszy na sztukę)
// ---------------------------------------------------------------------------
const flat = (c) => () => c;
// opłata nie wyższa niż narosłe odsetki: 1 miesiąc EDO 6% → 0,50 zł odsetek, opłata 3 zł → 0,50
const e1 = { type: "EDO", rate1: 6, margin: 2, fee: 3, purchase: "2026-01" };
const v1 = Z.bondValue(e1, 1, Z.periodRates(e1, flat(3)));
eq("opłata ograniczona do odsetek: brutto", v1.gross, 100.5);
eq("opłata ograniczona do odsetek: opłata", v1.fee, 0.5);
eq("opłata ograniczona do odsetek: netto", v1.net, 100);
// pełna opłata po 7 miesiącach: 100·(1+0,06·7/12) = 103,50 → 103,50 − 3 = 100,50
eq("pełna opłata", Z.bondValue(e1, 7, Z.periodRates(e1, flat(3))).net, 100.5);
// ujemna inflacja = 0 → stopa = marża
eq("ujemne CPI → marża", Z.periodRates(e1, flat(-1.2))[1], 0.02, 1e-12);
// CPI za miesiąc P−2: okres 2 EDO z 01.2026 zaczyna się 01.2027 → CPI za 11.2026
let asked = null;
Z.periodRates(e1, (ym) => { if (!asked) asked = ym; return 2; });
eq("CPI dla okresu 2 = odczyt za P−2", asked, "2026-11");
// wartość w terminie: 100·1,06·1,05^9, zaokrąglona do groszy
const vT = Z.bondValue(e1, 120, Z.periodRates(e1, flat(3)));
eq("EDO w terminie", vT.gross, Math.round(100 * 1.06 * Math.pow(1.05, 9) * 100) / 100);
eq("EDO w terminie bez opłaty", vT.fee, 0);
// TOS: stała stopa przez 3 lata
Z.periodRates({ type: "TOS", rate1: 4.4, margin: 0, purchase: "2026-11" }, flat(9)).forEach((r, i) => eq(`TOS stała stopa, okres ${i + 1}`, r, 0.044, 1e-12));
// COI: kupon roczny netto na konto; przedterminowy wykup liczy tylko odsetki bieżącego okresu
const coi = Z.compare({
  now: "2026-11", horizonMonths: 13,
  old: { type: "COI", rate1: 6, margin: 1.5, fee: 2, purchase: "2026-11", count: 10 },
  target: { type: "COI", rate1: 6, margin: 1.5, fee: 2 },
  cpiFuture: [0], savingsRate: 0, tax: true, valuation: "liquidate",
});
eq("COI kupon po 12 mies. (netto)", coi.months[12].keep, 10 * 100 + 10 * 6 * 0.81, 0.02);
// miesiąc 13: 100·(1+0,015/12)=100,13 → opłata 0,13 → 100; + kupon 48,60
eq("COI po 13 mies.", coi.months[13].keep, 1000 + 48.6, 0.02);
// „trzymam”: narosłe odsetki 0,125 zł/szt. (zaokrąglone do 100,13 zł/szt.) bez opłaty, po podatku
const coiH = Z.compare(Object.assign({}, { now: "2026-11", horizonMonths: 13,
  old: { type: "COI", rate1: 6, margin: 1.5, fee: 2, purchase: "2026-11", count: 10 },
  target: { type: "COI", rate1: 6, margin: 1.5, fee: 2 }, cpiFuture: [0], savingsRate: 0, tax: true }));
eq("COI po 13 mies. (trzymam)", coiH.months[13].keep, 1001.3 - 1.3 * 0.19 + 48.6, 0.005);

// IKE/IKZE: bez podatku, opłata zostaje
const ike = Z.compare({ now: "2026-11", horizonMonths: 1,
  old: { type: "EDO", rate1: 6, margin: 2, fee: 3, purchase: "2025-11", count: 10 },
  target: { type: "EDO", rate1: 5.35, margin: 2, fee: 3 }, cpiFuture: [3], savingsRate: 0, tax: false });
eq("IKE: podatek 0", ike.switchNow.tax, 0);
eq("IKE: wpływ = (106 − 3) · 10", ike.switchNow.proceeds, 1030);
eq("IKE: 10 nowych obligacji", ike.switchNow.newCount, 10);

// z podatkiem: zysk (103 − 100)·10 = 30 → podatek 5,70 → 1024,30 → 10 szt. + 24,30 zł
const tx = Z.compare(Object.assign({}, { now: "2026-11", horizonMonths: 1,
  old: { type: "EDO", rate1: 6, margin: 2, fee: 3, purchase: "2025-11", count: 10 },
  target: { type: "EDO", rate1: 5.35, margin: 2, fee: 3 }, cpiFuture: [3], savingsRate: 0 }));
eq("podatek przy zerwaniu", tx.switchNow.tax, 5.7);
eq("reszta na konto", tx.switchNow.cashRest, 24.3);

// błędy wejścia
let threw = false; try { Z.compare(Object.assign({}, ref, { now: "2021-01", horizonMonths: 12 })); } catch (e) { threw = true; }
eq("zakup po dacie zamiany → błąd", threw, true);

// próg inflacji: wynik liczbowy albo informacja, że znak się nie zmienia
const bi = Z.breakEvenInflation(Object.assign({}, ref, { now: "2024-04", horizonMonths: 72 }));
eq("próg inflacji zwraca wynik", typeof bi === "number" || (bi && bi.none === true), true);

// ---------------------------------------------------------------------------
// 2b. Portfel kilku serii: suma pozycji liczonych osobno
// ---------------------------------------------------------------------------
const pfBase = { now: "2024-04", target: ref.target, cpiHistory: ref.cpiHistory, cpiFuture: [2.5], savingsRate: 4, tax: true };
const posA = { type: "EDO", rate1: 2.7, margin: 1.25, fee: 2, purchase: "2022-04", count: 50 };   // wykup 04.2032
const posB = { type: "COI", rate1: 1.3, margin: 0.75, fee: 0.7, purchase: "2021-04", count: 30 }; // wykup 04.2025
const pf = Z.comparePortfolio(Object.assign({}, pfBase, { positions: [posA, posB] }));
eq("portfel: domyślny horyzont = wykup najpóźniejszej serii", pf.horizonMonths, 96);
eq("portfel: najpóźniejszy wykup", pf.latestMaturity, "2032-04");
const one = (o) => Z.compare(Object.assign({}, pfBase, { old: o, horizonMonths: 96 }));
const rA = one(posA), rB = one(posB);
eq("portfel: trzymam = suma pozycji", pf.atHorizon.keep, rA.atHorizon.keep + rB.atHorizon.keep);
eq("portfel: zamieniam wszystko = suma pozycji", pf.atHorizon.swapAll, rA.atHorizon.swap + rB.atHorizon.swap);
eq("portfel: wybór pozycji wg różnicy", pf.positions.map((x) => x.swap), [rA.atHorizon.diff > 0, rB.atHorizon.diff > 0]);
eq("portfel: wariant „wybrane” nie gorszy niż trzymanie", pf.atHorizon.diffBest >= 0, true);
eq("portfel: wariant „wybrane” nie gorszy niż zamiana wszystkiego", pf.atHorizon.best >= pf.atHorizon.swapAll - 1e-9, true);
eq("portfel: koszt zerwania wszystkiego = suma", pf.switchAll.cost, rA.switchNow.cost + rB.switchNow.cost);
eq("portfel: historia od najwcześniejszego zakupu", pf.past[0].ym, "2021-04");
eq("portfel: historia do 04.2022 tylko COI", pf.past[11].value, rB.past[11].value);
eq("COI w rocznicę: kupon w obu wariantach, różnica dziś = 0", rB.months[0].diff, 0);
eq("COI: historia łączy się z „dziś” (z kuponami otrzymanymi do dziś)", rB.past[rB.past.length - 1].value, rB.months[0].keep);
eq("COI: kupony otrzymane do dziś w obu wariantach", rB.months[0].swap - rB.switchNow.proceeds, rB.paidCoupons);
eq("COI: kupony do dziś = 3 lata netto", rB.paidCoupons, rB.oldRates.slice(0, 3).reduce((a, r) => a + 100 * r, 0) * 30 * 0.81, 0.01);
let mono = true; for (let i = 1; i < rB.past.length; i++) if (rB.past[i].value < rB.past[i - 1].value - 1e-9) mono = false;
eq("COI: historia z kuponami nie spada w rocznice", mono, true);
eq("portfel: historia łączy się z dziś", pf.past[pf.past.length - 1].value, pf.months[0].keep);
const pf1 = Z.comparePortfolio(Object.assign({}, pfBase, { positions: [posA] }));
eq("portfel z jedną serią = compare", pf1.atHorizon.diffAll, Z.compare(Object.assign({}, pfBase, { old: posA })).atHorizon.diff);
threw = false; try { Z.comparePortfolio(Object.assign({}, pfBase, { positions: [] })); } catch (e) { threw = true; }
eq("pusty portfel → błąd", threw, true);

// ---------------------------------------------------------------------------
// 3. Dane z archiwum (data/months.json)
// ---------------------------------------------------------------------------
const months = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "months.json"), "utf8"));
eq("kod EDO0434", Z.parseCode("EDO0434"), { type: "EDO", maturity: "2034-04", purchase: "2024-04" });
eq("kod COI1130 → zakup 11.2026", Z.parseCode("COI1130").purchase, "2026-11");
eq("kod niepoprawny", Z.parseCode("XYZ"), null);
const s1 = Z.seriesFromArchive(months, "EDO1136");
eq("seria z archiwum: EDO1136 znaleziona", s1.found, true);
eq("seria z archiwum: EDO1136 oprocentowanie", s1.rate1, 5.35);
eq("seria z archiwum: EDO1136 marża", s1.margin, 2);
eq("seria z archiwum: EDO1136 opłata", s1.fee, 3);
const hist = Z.cpiHistoryFromMonths(months);
eq("CPI za 02.2023 z archiwum", hist["2023-02"], 18.4);
eq("CPI za 02.2024 z archiwum", hist["2024-02"], 2.8);

// ---------------------------------------------------------------------------
// 4. ROR i DOR (list emisyjny 113/2025 i analogiczny DOR): miesięczne okresy, stopa NBP + marża,
//    kupon N·r/12 co miesiąc, od 2. okresu stała opłata 0,50 / 0,70 zł bez progu 100 zł
// ---------------------------------------------------------------------------
const nbpHist = Z.nbpHistoryFromMonths(months);
eq("NBP z archiwum: 12.2025", nbpHist["2025-12"], 4.25);
const ror = Z.seriesFromArchive(months, "ROR1126");
eq("ROR1126 z archiwum", [ror.found, ror.purchase, ror.rate1, ror.margin, ror.fee], [true, "2025-11", 4.5, 0, 0.5]);
const rorSpec = { type: "ROR", rate1: ror.rate1, margin: ror.margin, fee: ror.fee, purchase: ror.purchase };
const nbpAt = Z.makeNbpAt(nbpHist, 3, "2026-11");
const rorRates = Z.periodRates(rorSpec, () => 0, nbpAt);
eq("ROR: 12 okresów miesięcznych", rorRates.length, 12);
eq("ROR: stopy 11.2025–04.2026 (1. okres stały, dalej NBP z miesiąca okresu)", rorRates.slice(0, 6).map((r) => +(r * 100).toFixed(2)), [4.5, 4.25, 4, 4, 4, 3.75]);
eq("NBP w przyszłości ze scenariusza", nbpAt("2027-01"), 3);
eq("NBP na dziś z archiwum", nbpAt("2026-11"), 3.75);
eq("ROR: kupon 4,50% = 0,38 zł (N·r/12, zaokrąglenie do grosza)", Z.couponAmount("ROR", 0.045, true), 0.38);
eq("ROR: kupon 3,75% = 0,31 zł", Z.couponAmount("ROR", 0.0375, true), 0.31);
const rv = Z.bondValue(rorSpec, 6, rorRates);
eq("ROR od 2. okresu: opłata stała 0,50 zł", rv.fee, 0.5);
eq("ROR od 2. okresu: wypłata 99,50 zł (bez progu 100 zł)", rv.net, 99.5);
eq("ROR: 6 kuponów do 6. miesiąca", rv.coupons.length, 6);
eq("ROR w 1. okresie: opłata ≤ narosłe odsetki", Z.bondValue(rorSpec, 0, rorRates).fee, 0);
const dorSpec = { type: "DOR", rate1: 4.65, margin: 0.15, fee: 0.7, purchase: "2025-11" };
const dorRates = Z.periodRates(dorSpec, () => 0, nbpAt);
eq("DOR: 24 okresy, marża 0,15", [dorRates.length, +(dorRates[1] * 100).toFixed(2)], [24, 4.4]);
eq("DOR: opłata 0,70 zł", Z.bondValue(dorSpec, 3, dorRates).net, 99.3);

const rorBase = { now: "2026-05", old: Object.assign({ count: 100 }, rorSpec), target: { type: "EDO", rate1: 5.6, margin: 2, fee: 3 },
  cpiHistory: hist, nbpHistory: nbpHist, nbpFuture: 3.75, cpiFuture: [2.5], savingsRate: 0, tax: true };
const rc = Z.compare(rorBase);
eq("ROR: domyślny horyzont = do wykupu (6 mies.)", rc.horizonMonths, 6);
eq("ROR: zerwanie — opłata 50 zł, bez podatku (strata)", [rc.switchNow.fee, rc.switchNow.tax], [50, 0]);
eq("ROR: z 9950 zł → 99 szt. po 100 zł + 50 zł", [rc.switchNow.newCount, r2(rc.switchNow.cashRest)], [99, 50]);
eq("ROR: kupon miesięczny netto w wariancie „trzymam”", rc.months[1].keep - rc.months[0].keep, Z.couponAmount("ROR", rc.oldRates[6], true) * 100 * 0.81, 1e-9);
eq("ROR: kupony do dziś w wartości (6 mies.)", rc.paidCoupons, rc.oldRates.slice(0, 6).reduce((a, r) => a + Z.couponAmount("ROR", r, true), 0) * 100 * 0.81, 1e-9);
eq("ROR: historia łączy się z dziś", rc.past[rc.past.length - 1].value, rc.months[0].keep, 1e-9);
const rw = rc.keepEvents.filter((e) => e.kind === "wykup");
eq("ROR: wykup w terminie po 6 mies. (100 zł/szt.) → zamiana po 99,90 razem z kuponami z konta", [rw.length, rw[0].t, rw[0].proceeds, rw[0].newCount],
  [1, 6, 10000, Math.floor((10000 + rc.months[5].keep - 10000 + Z.couponAmount("ROR", rc.oldRates[11], true) * 100 * 0.81 - rc.paidCoupons) / 99.9)]);
// zamiana EDO → ROR: kupony ROR co miesiąc na konto, stopa ze scenariusza NBP
const toRor = Z.compare(Object.assign({}, rorBase, { old: { type: "EDO", rate1: 6.8, margin: 1.5, fee: 2, purchase: "2024-04", count: 10 },
  target: { type: "ROR", rate1: 4, margin: 0, fee: 0.5 }, nbpFuture: 2 }));
eq("cel ROR: okres w miesiącu z archiwum — NBP z archiwum", +(toRor.targetRates[2] * 100).toFixed(2), 3.75);
eq("cel ROR: okres po archiwum (12.2026) — NBP ze scenariusza", +(toRor.targetRates[7] * 100).toFixed(2), 2);

console.log(`${pass} OK, ${fail} błędów`);
process.exit(fail ? 1 : 0);
