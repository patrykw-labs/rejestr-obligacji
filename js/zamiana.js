/*
 * Silnik kalkulatora zamiany obligacji skarbowych (zerwać i kupić nowe czy trzymać?).
 * Czyste funkcje, bez DOM. Działa w przeglądarce (window.Zamiana) i w Node (module.exports).
 *
 * Zasady z listów emisyjnych (sprawdzone na listach z 11.2026):
 *  - 1. okres: stała stopa rate1; kolejne roczne okresy (EDO/COI/ROS/ROD): r = max(CPI, 0) + marża,
 *    gdzie CPI to odczyt r/r ogłaszany w miesiącu poprzedzającym okres, czyli CPI za miesiąc P−2.
 *    TOS: stała stopa przez cały okres życia.
 *  - EDO/ROS/ROD/TOS: kapitalizacja roczna, W = N·(1+r1)·…·(1+rn), zaokrąglenie do groszy.
 *    COI: odsetki wypłacane co rok, N·r.
 *  - Przedterminowy wykup w okresie k: N·Π(1+ri)·(1+rk·a/12) − b, nie mniej niż N
 *    (opłata b nie wyższa niż narosłe odsetki). Tu a = pełne miesiące okresu (przybliżenie dni/ACT).
 *  - Podatek Belki od zysku (po opłacie); przy IKE/IKZE pomijany. Opłata za wykup zostaje.
 *  - Zakup po zerwaniu: 100 zł za obligację, całe sztuki, reszta na konto.
 *    Zamiana po 99,90 zł tylko przy wykupie w terminie (rollover).
 */
(function (root) {
  "use strict";

  const TYPES = {
    EDO: { term: 120, indexed: true, coupon: false, label: "EDO (10 lat)" },
    ROD: { term: 144, indexed: true, coupon: false, label: "ROD (12 lat, 800+)" },
    ROS: { term: 72, indexed: true, coupon: false, label: "ROS (6 lat, 800+)" },
    COI: { term: 48, indexed: true, coupon: true, label: "COI (4 lata)" },
    TOS: { term: 36, indexed: false, coupon: false, label: "TOS (3 lata)" },
    // ROR/DOR: miesięczne okresy odsetkowe, stopa = referencyjna NBP + marża, odsetki wypłacane co miesiąc;
    // od 2. okresu przy przedterminowym wykupie stała opłata (bez progu 100 zł) — listy emisyjne, np. 113/2025
    DOR: { term: 24, period: 1, nbp: true, coupon: true, flatFee: true, label: "DOR (2 lata)" },
    ROR: { term: 12, period: 1, nbp: true, coupon: true, flatFee: true, label: "ROR (1 rok)" },
  };
  const periodOf = (type) => TYPES[type].period || 12;
  const NOMINAL = 100;

  // ---------- daty "RRRR-MM" ----------
  const ymToIdx = (ym) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); };
  const idxToYm = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const addMonths = (ym, n) => idxToYm(ymToIdx(ym) + n);
  const monthsBetween = (a, b) => ymToIdx(b) - ymToIdx(a);
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  /** Kod serii, np. EDO0434 → wykup 2034-04, zakup = wykup − okres. */
  function parseCode(code) {
    const m = /^([A-Z]{3})(\d{2})(\d{2})$/.exec(String(code || "").toUpperCase().trim());
    if (!m || !TYPES[m[1]]) return null;
    const maturity = `20${m[3]}-${m[2]}`;
    return { type: m[1], maturity, purchase: addMonths(maturity, -TYPES[m[1]].term) };
  }

  /**
   * Stopy procentowe kolejnych okresów obligacji.
   * spec: {type, rate1 (%), margin (%), purchase "RRRR-MM"}; cpiAt(ym) → % CPI r/r za miesiąc ym;
   * nbpAt(ym) → % stopa referencyjna NBP dla okresu odsetkowego zaczynającego się w miesiącu ym (ROR/DOR).
   * Zwraca tablicę ułamków (0.0535 itd.) o długości liczby okresów (lat; dla ROR/DOR — miesięcy).
   */
  function periodRates(spec, cpiAt, nbpAt) {
    const t = TYPES[spec.type];
    const P = periodOf(spec.type);
    const n = Math.ceil(t.term / P);
    const out = [];
    for (let k = 1; k <= n; k++) {
      if (k === 1 || (!t.indexed && !t.nbp)) { out.push(spec.rate1 / 100); continue; }
      if (t.nbp) {
        // stopa NBP z 10. dnia roboczego przed 1. dniem miesiąca, w którym zaczyna się okres (ujemna = 0) + marża
        const ref = nbpAt ? nbpAt(addMonths(spec.purchase, (k - 1) * P)) : spec.rate1 - (spec.margin || 0);
        out.push((Math.max(ref, 0) + (spec.margin || 0)) / 100);
        continue;
      }
      const start = addMonths(spec.purchase, (k - 1) * 12);
      const cpi = cpiAt(addMonths(start, -2));
      out.push((Math.max(cpi, 0) + spec.margin) / 100);
    }
    return out;
  }

  /**
   * Wartość jednej obligacji w wieku `age` miesięcy (0..term).
   * Zwraca {gross, fee, net (przed podatkiem), couponsPaid: [{age, amount}], matured}.
   * Dla COI gross = N + odsetki bieżącego okresu (kupony wcześniejsze w couponsPaid).
   */
  function bondValue(spec, age, rates, opts = {}) {
    const t = TYPES[spec.type];
    const round = opts.roundPerBond !== false;
    const term = t.term;
    const matured = age >= term;
    const a = Math.min(age, term);
    const P = periodOf(spec.type);
    const fullPeriods = Math.floor(a / P);
    const partial = a - fullPeriods * P;
    const coupons = [];
    let base = NOMINAL;
    if (t.coupon) {
      for (let k = 1; k <= fullPeriods; k++) coupons.push({ age: k * P, amount: couponAmount(spec.type, rates[k - 1], round) });
    } else {
      for (let k = 1; k <= fullPeriods; k++) base *= 1 + rates[k - 1];
    }
    if (matured) {
      const gross = t.coupon ? NOMINAL : base;
      return { gross: round ? r2(gross) : gross, fee: 0, net: round ? r2(gross) : gross, coupons, matured: true };
    }
    // w trakcie okresu (lub na granicy okresu = koniec poprzedniego okresu)
    let gross;
    if (t.coupon) {
      // na granicy okresu kupon został właśnie wypłacony
      gross = NOMINAL * (1 + rates[fullPeriods] * partial / 12);
    } else {
      gross = base * (1 + rates[fullPeriods] * partial / 12);
    }
    if (round) gross = r2(gross);
    const accrued = gross - NOMINAL; // narosłe odsetki (dla COI, ROR, DOR: tylko bieżący okres)
    // ROR/DOR od 2. okresu: stała opłata, także gdy przekracza narosłe odsetki (wypłata może być < 100 zł)
    const fee = t.flatFee && fullPeriods >= 1 ? spec.fee : Math.max(0, Math.min(spec.fee, accrued));
    const net = round ? r2(gross - fee) : gross - fee;
    return { gross, fee, net, coupons, matured: false };
  }

  /** Kupon od jednej obligacji za pełny okres (COI: roczny; ROR/DOR: N·r/12, zaokrąglony do grosza). */
  function couponAmount(type, rate, round) {
    const c = NOMINAL * rate * periodOf(type) / 12;
    return TYPES[type].nbp && round ? r2(c) : c;
  }

  /** Stała miesięczna stopa konta (netto po podatku, jeśli tax). */
  const monthlySavings = (ratePct, tax, taxRate) => (ratePct / 100) / 12 * (tax ? 1 - taxRate : 1);

  /**
   * Symulacja jednej "nogi" (scenariusza) od teraz (t = 0) do horyzontu H.
   * leg: {spec, count, ageAt0, cash0}
   * Po wykupie w terminie: zamiana na `rollover` po cenie swapPrice (całe sztuki), reszta na konto.
   * Zwraca tablicę wartości likwidacyjnych netto (po opłacie i podatku) dla t = 0..H.
   */
  function simulateLeg(leg, ctx) {
    const { H, cpiAt, nbpAt, tax, taxRate, savingsRate, swapPrice, rollover, opts } = ctx;
    const mSav = monthlySavings(savingsRate, tax, taxRate);
    let spec = leg.spec;
    let count = leg.count;
    let ageAt0 = leg.ageAt0;       // wiek obligacji w t = 0
    let startT = 0;                // t, w którym bieżąca obligacja ma wiek ageAt0
    let rates = periodRates(spec, cpiAt, nbpAt);
    let costBasis = leg.costBasis != null ? leg.costBasis : NOMINAL; // koszt nabycia 1 szt. (podatek)
    let cash = leg.cash0 || 0;
    let paidCoupons = new Set();
    const out = [];
    const events = [];

    for (let t = 0; t <= H; t++) {
      if (t > 0) cash *= 1 + mSav;
      let age = ageAt0 + (t - startT);
      const term = TYPES[spec.type].term;

      // kupony COI wypłacone w tym miesiącu (kupon z rocznicy przypadającej dziś, t = 0, inwestor dostaje
      // w obu wariantach — tak jak wcześniejsze kupony nie wchodzi do porównania)
      const P = periodOf(spec.type);
      if (TYPES[spec.type].coupon && t > 0 && age > 0 && age % P === 0 && age <= term && !paidCoupons.has(age)) {
        paidCoupons.add(age);
        const c = couponAmount(spec.type, rates[age / P - 1], opts.roundPerBond) * count;
        const cNet = c * (tax ? 1 - taxRate : 1);
        cash += cNet;
        events.push({ t, kind: "kupon", amount: cNet });
      }

      // wykup w terminie → zamiana na rollover
      if (age >= term && t <= H) {
        const v = bondValue(spec, term, rates, opts);
        const gross = v.gross * count;
        const gain = gross - costBasis * count;
        const taxPaid = tax ? r2(Math.max(0, gain) * taxRate) : 0;
        const proceeds = gross - taxPaid;
        const roll = Object.assign({}, rollover, { purchase: addMonths(ctx.now, t) });
        const n = Math.floor((proceeds + cash) / swapPrice);
        events.push({ t, kind: "wykup", spec, count, proceeds, newCount: n });
        cash = proceeds + cash - n * swapPrice;
        spec = roll; count = n; ageAt0 = 0; startT = t; rates = periodRates(spec, cpiAt, nbpAt);
        costBasis = opts.taxBasisNominal ? NOMINAL : swapPrice; paidCoupons = new Set();
        age = 0;
      }

      // wycena z końcem miesiąca t:
      //  "hold" (domyślnie) — trzymasz dalej: wartość po podatku od narosłych odsetek, bez opłaty za wykup;
      //  "liquidate" — wypłacasz wszystko: po opłacie i podatku.
      const v = bondValue(spec, age, rates, opts);
      const gross = (opts.valuation === "liquidate" ? v.net : v.gross) * count;
      const gain = gross - costBasis * count;
      const taxDue = tax ? Math.max(0, gain) * taxRate : 0;
      out.push({ t, ym: addMonths(ctx.now, t), spec: spec.type, count, bonds: gross - taxDue, cash, total: gross - taxDue + cash });
    }
    return { series: out, events };
  }

  /** Inflacja przyszła: future[y] dla roku y (0 = pierwsze 12 mies. od teraz). */
  /**
   * Stopa NBP dla okresu zaczynającego się w miesiącu ym: z historii (stopa z 1. dnia miesiąca — od 2022 r. NBP
   * zmieniał stopy zawsze przed 10. dniem miesiąca, więc to ta sama stopa co z 10. dnia roboczego przed nim),
   * dla przyszłych miesięcy — scenariusz (liczba: stała stopa; tablica: rok po roku od dziś).
   */
  function makeNbpAt(history, future, now) {
    const keys = Object.keys(history || {}).sort();
    const last = keys.length ? history[keys[keys.length - 1]] : 0;
    const fut = future == null ? [last] : [].concat(future);
    return function (ym) {
      if (history && history[ym] != null) return history[ym];
      const d = monthsBetween(now, ym);
      if (d <= 0) { const prev = keys.filter((k) => k <= ym).pop(); return prev ? history[prev] : fut[0]; }
      return fut[Math.min(Math.floor((d - 1) / 12), fut.length - 1)];
    };
  }

  /** Historia stopy referencyjnej NBP z data/months.json: {"RRRR-MM": % obowiązujące 1. dnia miesiąca}. */
  function nbpHistoryFromMonths(monthsObj) {
    const h = {};
    for (const [ym, rec] of Object.entries(monthsObj)) if (rec && typeof rec.nbpRef === "number") h[ym] = rec.nbpRef;
    return h;
  }

  function makeCpiAt(history, future, now) {
    return function (ym) {
      if (history && history[ym] != null) return history[ym];
      const d = monthsBetween(now, ym);        // CPI za miesiąc ym; ym < now bez danych → rok 0
      const y = Math.max(0, Math.floor(d / 12));
      return future[Math.min(y, future.length - 1)];
    };
  }

  /**
   * Główne porównanie.
   * p = {
   *   now: "RRRR-MM", horizonMonths,
   *   old:    {type, rate1, margin, fee, purchase, count},
   *   target: {type, rate1, margin, fee},
   *   rollover: {type, rate1, margin, fee}   (domyślnie target),
   *   cpiHistory: {"RRRR-MM": %}, cpiFuture: [% rok 1, % rok 2, …],
   *   savingsRate: %, tax: true|false (false = IKE/IKZE), taxRate: 0.19,
   *   buyPrice: 100, swapPrice: 99.9, roundPerBond: true,
   *   valuation: "hold" (domyślnie: jedyne zerwanie to zamiana dziś, dalej obie strony trzymają obligacje
   *              do wykupu i zamieniają po 99,90; wycena bez opłaty za wykup)
   *            | "liquidate" (wycena jak przy wypłacie wszystkiego, z opłatą)
   * }
   */
  function compare(p) {
    const now = p.now;
    const oldTerm = TYPES[p.old.type].term;
    const toMaturity = oldTerm - monthsBetween(p.old.purchase, p.now);
    const H = Math.max(1, Math.round(p.horizonMonths == null || p.horizonMonths === "maturity" ? toMaturity : p.horizonMonths));
    const taxRate = p.taxRate != null ? p.taxRate : 0.19;
    const tax = p.tax !== false;
    const buyPrice = p.buyPrice || NOMINAL;
    const swapPrice = p.swapPrice || 99.9;
    const future = (p.cpiFuture && p.cpiFuture.length) ? p.cpiFuture : [2.5];
    const cpiAt = makeCpiAt(p.cpiHistory || {}, future, now);
    const nbpAt = makeNbpAt(p.nbpHistory || {}, p.nbpFuture, now);
    // taxBasisNominal: podatek od zysku liczony względem 100 zł także po zamianie po 99,90 (zgodność z arkuszem kontrolnym)
    const opts = { roundPerBond: p.roundPerBond !== false, taxBasisNominal: !!p.taxBasisNominal,
      valuation: p.valuation === "liquidate" ? "liquidate" : "hold" };
    const rollover = Object.assign({}, p.rollover || p.target);
    const ctx = { H, cpiAt, nbpAt, tax, taxRate, savingsRate: p.savingsRate || 0, swapPrice, rollover, now, opts };

    const oldSpec = Object.assign({}, p.old);
    const age0 = monthsBetween(oldSpec.purchase, now);
    if (age0 < 0) throw new Error("Data zakupu jest późniejsza niż data zamiany");
    if (age0 >= TYPES[oldSpec.type].term) throw new Error("Obligacje są już po terminie wykupu");
    const oldRates = periodRates(oldSpec, cpiAt, nbpAt);

    // historia: wartość inwestycji od miesiąca zakupu do dziś (ta sama wycena co dalej) — obligacje po podatku
    // od narosłych odsetek plus kupony COI wypłacone do danego miesiąca (netto, bez oprocentowania)
    const histAt = (a) => {
      const v = bondValue(oldSpec, a, oldRates, opts);
      const gross = (opts.valuation === "liquidate" ? v.net : v.gross) * p.old.count;
      const bonds = gross - (tax ? Math.max(0, gross - NOMINAL * p.old.count) * taxRate : 0);
      const coupons = v.coupons.reduce((sum, c) => sum + c.amount, 0) * p.old.count * (tax ? 1 - taxRate : 1);
      return { bonds, coupons };
    };
    const past = [];
    for (let a = 0; a <= age0; a++) {
      const h = histAt(a);
      past.push({ t: a - age0, ym: addMonths(oldSpec.purchase, a), value: h.bonds + h.coupons });
    }
    // kupony COI otrzymane do dziś (także w rocznicę przypadającą dziś) inwestor ma w obu wariantach:
    // doliczamy je jako stałą kwotę do obu, więc wykres jest ciągły, a różnica się nie zmienia
    const paidCoupons = histAt(age0).coupons;

    // A: trzymam
    const keep = simulateLeg({ spec: oldSpec, count: p.old.count, ageAt0: age0 }, ctx);

    // B: zrywam teraz i kupuję nowe po buyPrice
    const v0 = bondValue(oldSpec, age0, oldRates, opts);
    const grossNet = v0.net * p.old.count;        // po opłacie
    const gain0 = grossNet - NOMINAL * p.old.count;
    const tax0 = tax ? r2(Math.max(0, gain0) * taxRate) : 0;
    const proceeds = grossNet - tax0;
    const newCount = Math.floor(proceeds / buyPrice);
    const cashRest = proceeds - newCount * buyPrice;
    const targetSpec = Object.assign({}, p.target, { purchase: now });
    const swap = simulateLeg({ spec: targetSpec, count: newCount, ageAt0: 0, cash0: cashRest, costBasis: buyPrice }, ctx);

    // deflator (wartości realne, w dzisiejszych złotych)
    const defl = [1];
    for (let t = 1; t <= H; t++) {
      const y = Math.min(Math.floor((t - 1) / 12), future.length - 1);
      defl.push(defl[t - 1] * Math.pow(1 + future[y] / 100, 1 / 12));
    }

    const months = keep.series.map((k, t) => {
      const s = swap.series[t];
      const kt = k.total + paidCoupons, st = s.total + paidCoupons;
      return {
        t, ym: k.ym,
        keep: kt, swap: st, diff: st - kt,
        keepReal: kt / defl[t], swapReal: st / defl[t], diffReal: (st - kt) / defl[t],
        keepBond: k.spec, swapBond: s.spec,
      };
    });
    const last = months[H];

    // od kiedy zamiana się opłaca (i opłaca do końca horyzontu)
    let breakEvenMonth = null;
    for (let t = H; t >= 0; t--) { if (months[t].diff >= 0) breakEvenMonth = t; else break; }

    return {
      now, horizonMonths: H, ageNow: age0, monthsToMaturity: toMaturity, maturity: addMonths(oldSpec.purchase, oldTerm),
      switchNow: {
        valueBeforeFee: v0.gross * p.old.count, fee: v0.fee * p.old.count, tax: tax0,
        proceeds, newCount, cashRest,
        // co tracisz w momencie zamiany względem wartości brutto
        cost: v0.fee * p.old.count + tax0,
      },
      months, past, paidCoupons, keepEvents: keep.events, swapEvents: swap.events,
      atHorizon: { keep: last.keep, swap: last.swap, diff: last.diff, keepReal: last.keepReal, swapReal: last.swapReal, diffReal: last.diffReal },
      breakEvenMonth,
      oldRates, targetRates: periodRates(targetSpec, cpiAt, nbpAt),
    };
  }

  /**
   * Portfel kilku serii: każda pozycja liczona osobno funkcją compare (te same założenia i ta sama seria docelowa,
   * wspólny horyzont), wyniki sumowane miesiąc po miesiącu.
   * p = jak w compare, ale zamiast old: positions: [{type, rate1, margin, fee, purchase, count}, …].
   * Domyślny horyzont = wykup najpóźniej zapadającej serii.
   * Zamiana opłaca się dla pozycji, której różnica na koniec horyzontu jest dodatnia; wariant „best” = zamiana
   * tylko takich pozycji (reszta trzymana), „all” = zamiana wszystkich.
   */
  function comparePortfolio(p) {
    const pos = p.positions || [];
    if (!pos.length) throw new Error("Portfel jest pusty");
    const now = p.now;
    const toMat = pos.map((o) => TYPES[o.type].term - monthsBetween(o.purchase, now));
    const H = Math.max(1, Math.round(p.horizonMonths == null || p.horizonMonths === "maturity" ? Math.max(...toMat) : p.horizonMonths));
    const results = pos.map((o) => compare(Object.assign({}, p, { old: o, horizonMonths: H })));
    const pick = results.map((r) => r.atHorizon.diff > 0);
    const anyPick = pick.some(Boolean);

    const months = [];
    for (let t = 0; t <= H; t++) {
      const m = { t, ym: results[0].months[t].ym, keep: 0, swapAll: 0, best: 0, keepReal: 0, swapAllReal: 0, bestReal: 0 };
      results.forEach((r, i) => {
        const x = r.months[t];
        m.keep += x.keep; m.swapAll += x.swap; m.best += pick[i] ? x.swap : x.keep;
        m.keepReal += x.keepReal; m.swapAllReal += x.swapReal; m.bestReal += pick[i] ? x.swapReal : x.keepReal;
      });
      m.diffAll = m.swapAll - m.keep; m.diffAllReal = m.swapAllReal - m.keepReal;
      m.diffBest = m.best - m.keep; m.diffBestReal = m.bestReal - m.keepReal;
      months.push(m);
    }

    // historia: suma wartości od najwcześniejszego zakupu (serie kupione później dochodzą w miesiącu zakupu)
    const first = pos.map((o) => o.purchase).sort()[0];
    const age = monthsBetween(first, now);
    const past = [];
    for (let a = 0; a <= age; a++) {
      const ym = addMonths(first, a);
      let value = 0;
      for (const r of results) { const e = r.past.find((x) => x.ym === ym); if (e) value += e.value; }
      past.push({ t: a - age, ym, value });
    }

    const sumSwitch = (which) => {
      const s = { valueBeforeFee: 0, fee: 0, tax: 0, proceeds: 0, newCount: 0, cashRest: 0, cost: 0 };
      results.forEach((r, i) => { if (!which(i)) return; for (const k in s) s[k] += r.switchNow[k]; });
      return s;
    };
    const lastBE = (k) => { let b = null; for (let t = H; t >= 0; t--) { if (months[t][k] >= 0) b = t; else break; } return b; };
    const last = months[H];
    return {
      now, horizonMonths: H, latestMaturity: results.map((r) => r.maturity).sort().pop(),
      positions: results.map((r, i) => ({ spec: pos[i], result: r, swap: pick[i], diff: r.atHorizon.diff, diffReal: r.atHorizon.diffReal })),
      anyPick, months, past,
      switchAll: sumSwitch(() => true), switchBest: sumSwitch((i) => pick[i]),
      atHorizon: { keep: last.keep, swapAll: last.swapAll, best: last.best, diffAll: last.diffAll, diffBest: last.diffBest,
        keepReal: last.keepReal, swapAllReal: last.swapAllReal, bestReal: last.bestReal, diffAllReal: last.diffAllReal, diffBestReal: last.diffBestReal },
      breakEvenMonthAll: lastBE("diffAll"), breakEvenMonthBest: anyPick ? lastBE("diffBest") : null,
    };
  }

  /** Stała przyszła inflacja, przy której różnica na koniec horyzontu = 0 (bisekcja). */
  function breakEvenInflation(p, lo = -2, hi = 25) {
    const f = (c) => compare(Object.assign({}, p, { cpiFuture: [c] })).atHorizon.diff;
    let flo = f(lo), fhi = f(hi);
    if (flo === 0) return lo;
    if (fhi === 0) return hi;
    if (Math.sign(flo) === Math.sign(fhi)) return { none: true, sign: Math.sign(flo) };
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2, fm = f(mid);
      if (Math.abs(fm) < 0.005) return mid;
      if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
    }
    return (lo + hi) / 2;
  }

  /** Historia CPI z data/months.json: {"RRRR-MM" (miesiąc odczytu): %}. */
  function cpiHistoryFromMonths(monthsObj) {
    const h = {};
    for (const rec of Object.values(monthsObj)) {
      if (rec && rec.cpiRefMonth && typeof rec.cpi === "number") h[rec.cpiRefMonth] = rec.cpi;
    }
    return h;
  }

  /** Parametry serii z archiwum po kodzie (np. "EDO0434"). */
  function seriesFromArchive(monthsObj, code) {
    const info = parseCode(code);
    if (!info) return null;
    const rec = monthsObj[info.purchase];
    const s = rec && rec.series && rec.series[info.type];
    if (!s || String(s.code).toUpperCase() !== String(code).toUpperCase()) return Object.assign({ found: false }, info);
    return Object.assign({ found: true }, info, {
      rate1: s.rate1, margin: s.margin == null ? 0 : s.margin,
      fee: typeof s.fee === "number" ? s.fee : 0,
    });
  }

  const api = { TYPES, NOMINAL, parseCode, periodRates, bondValue, compare, comparePortfolio, breakEvenInflation,
    cpiHistoryFromMonths, nbpHistoryFromMonths, makeNbpAt, couponAmount, seriesFromArchive, addMonths, monthsBetween, simulateLeg, makeCpiAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Zamiana = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
