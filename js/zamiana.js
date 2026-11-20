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
 *    COI od 2. roku, ROR/DOR od 2. miesiąca: stała opłata b, bez progu N (flatFee).
 *    Okno: nie wcześniej niż po 7 dniach od sprzedaży i nie później niż 20 dni przed wykupem (redeemWindow);
 *    bez ograniczeń przy wypłacie z IKE/IKZE.
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
    // COI: w 1. roku opłata nie wyższa niż narosłe odsetki, od 2. roku stała (bez progu 100 zł) — list COI1130 (pkt 5–6)
    COI: { term: 48, indexed: true, coupon: true, flatFee: true, label: "COI (4 lata)" },
    TOS: { term: 36, indexed: false, coupon: false, label: "TOS (3 lata)" },
    // DOS (w ofercie do 05.2022): 2 lata, stała stopa, kapitalizacja roczna — tylko do historii serii
    DOS: { term: 24, indexed: false, coupon: false, label: "DOS (2 lata)" },
    // ROR/DOR: miesięczne okresy odsetkowe, stopa = referencyjna NBP + marża, odsetki wypłacane co miesiąc;
    // od 2. okresu przy przedterminowym wykupie stała opłata (bez progu 100 zł) — listy emisyjne, np. 113/2025
    DOR: { term: 24, period: 1, nbp: true, coupon: true, flatFee: true, label: "DOR (2 lata)" },
    ROR: { term: 12, period: 1, nbp: true, coupon: true, flatFee: true, label: "ROR (1 rok)" },
    // OTS: 3 miesiące, stała stopa, odsetki (N·r·3/12) przy wykupie; przy przedterminowym wykupie odsetki
    // nie przysługują (wypłata = 100 zł); cena zamiany na OTS 100,00 zł — listy emisyjne, np. OTS0227
    OTS: { term: 3, period: 3, coupon: false, noEarlyInterest: true, swapPrice: 100, label: "OTS (3 mies.)" },
  };
  const periodOf = (type) => TYPES[type].period || 12;
  const NOMINAL = 100;

  // ---------- daty "RRRR-MM" ----------
  const ymToIdx = (ym) => { const [y, m] = ym.split("-").map(Number); return y * 12 + (m - 1); };
  const idxToYm = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
  const addMonths = (ym, n) => idxToYm(ymToIdx(ym) + n);
  const monthsBetween = (a, b) => ymToIdx(b) - ymToIdx(a);
  const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

  const daysIn = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  /**
   * Wiek obligacji w miesiącach (z ułamkiem) w dniu zerwania: pełne miesiące od zakupu + część bieżącego
   * miesięcznego okresu (od „miesięcznicy” zakupu do następnej). Bez dni (pd/bd puste) — pełne miesiące jak dotąd.
   * Dni powyżej długości miesiąca przyjmujemy jako ostatni dzień miesiąca (jak w tabelach okresów odsetkowych).
   */
  function ageMonths(purchase, now, purchaseDay, breakDay) {
    const whole = monthsBetween(purchase, now);
    if (!purchaseDay || !breakDay) return whole;
    const clamp = (ym, d) => Math.min(Math.max(1, Math.round(d)), daysIn(ym));
    const pdNow = clamp(now, purchaseDay), b = clamp(now, breakDay);
    if (b >= pdNow) {
      const len = daysIn(now) - pdNow + clamp(addMonths(now, 1), purchaseDay);
      return whole + (b - pdNow) / len;
    }
    const prev = addMonths(now, -1), pdPrev = clamp(prev, purchaseDay);
    const len = daysIn(prev) - pdPrev + pdNow;
    return whole - 1 + (daysIn(prev) - pdPrev + b) / len;
  }

  /**
   * Okno przedterminowego wykupu z listów emisyjnych: dyspozycję można złożyć „nie wcześniej niż po upływie siedmiu dni
   * kalendarzowych od dnia sprzedaży” (czyli od 8. dnia po zakupie) i „nie później niż dwadzieścia dni kalendarzowych przed
   * dniem wykupu”. Nie dotyczy wypłaty z IKE/IKZE (sprawdza to wywołujący). Bez dnia zakupu: wariant najłagodniejszy
   * (zakup 1. dnia dla dolnej granicy, wykup ostatniego dnia miesiąca dla górnej).
   * Zwraca {ok, reason: null | "early" | "late", from, until, maturity} — daty "RRRR-MM-DD".
   */
  function redeemWindow(type, purchase, purchaseDay, now, day) {
    const t = TYPES[type];
    const DAY = 864e5, maturityYm = addMonths(purchase, t.term);
    const at = (ym, d) => { const [y, m] = ym.split("-").map(Number); return Date.UTC(y, m - 1, Math.min(Math.max(1, Math.round(d)), daysIn(ym))); };
    const iso = (x) => new Date(x).toISOString().slice(0, 10);
    const from = at(purchase, purchaseDay || 1) + 8 * DAY;
    const mat = at(maturityYm, purchaseDay || 31), until = mat - 20 * DAY;
    const today = at(now, day || 1);
    const reason = today < from ? "early" : today > until ? "late" : null;
    return { ok: !reason, reason, from: iso(from), until: iso(until), maturity: iso(mat) };
  }

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
      for (let k = 1; k <= fullPeriods; k++) base *= 1 + rates[k - 1] * P / 12;
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
    // COI, ROR, DOR od 2. okresu: stała opłata, także gdy przekracza narosłe odsetki (wypłata może być < 100 zł)
    const fee = t.noEarlyInterest ? Math.max(0, accrued)
      : t.flatFee && fullPeriods >= 1 ? spec.fee : Math.max(0, Math.min(spec.fee, accrued));
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
    // chwila zakupu bieżącej obligacji na osi t (t = 0 to dzień zerwania; wiek może mieć ułamek miesiąca)
    let boughtAt = -leg.ageAt0;
    let rates = periodRates(spec, cpiAt, nbpAt);
    let costBasis = leg.costBasis != null ? leg.costBasis : NOMINAL; // koszt nabycia 1 szt. (podatek)
    let cash = leg.cash0 || 0;
    // kupony wypłacone przed dniem zerwania (także w rocznicę przypadającą dziś) są poza porównaniem
    let paidUpTo = Math.floor(leg.ageAt0 / periodOf(spec.type) + 1e-9);
    const out = [];
    const events = [];

    for (let t = 0; t <= H; t++) {
      if (t > 0) cash *= 1 + mSav;
      let age = t - boughtAt;
      const term = TYPES[spec.type].term;

      // kupony (COI, ROR, DOR) za okresy zakończone od poprzedniego kroku
      const P = periodOf(spec.type);
      if (TYPES[spec.type].coupon) {
        while ((paidUpTo + 1) * P <= Math.min(age, term) + 1e-9) {
          paidUpTo++;
          const c = couponAmount(spec.type, rates[paidUpTo - 1], opts.roundPerBond) * count;
          const cNet = c * (tax ? 1 - taxRate : 1);
          cash += cNet;
          events.push({ t, kind: "kupon", amount: cNet });
        }
      }

      // wykup w terminie → zamiana na rollover
      if (age >= term - 1e-9 && t <= H) {
        const v = bondValue(spec, term, rates, opts);
        const gross = v.gross * count;
        const gain = gross - costBasis * count;
        const taxPaid = tax ? r2(Math.max(0, gain) * taxRate) : 0;
        const proceeds = gross - taxPaid;
        const roll = Object.assign({}, rollover, { purchase: addMonths(ctx.now, t) });
        // cena zamiany zależy od kupowanej serii (OTS 100,00 zł, pozostałe 99,90 zł), chyba że podano ją wprost
        const rollPrice = rollover.swapPrice || TYPES[rollover.type].swapPrice || swapPrice;
        // wykup na sam koniec okresu (t = H): wypłata na konto, bez zamiany — nowe obligacje po 99,90 zł wycenione
        // od razu po 100 zł dawałyby zysk, którego w tym okresie nie ma
        const final = t === H;
        const n = final ? 0 : Math.floor((proceeds + cash) / rollPrice);
        events.push({ t, kind: "wykup", spec, count, proceeds, newCount: n, final });
        cash = proceeds + cash - n * rollPrice;
        if (final) count = 0;
        else {
          // nowa seria kupiona w dniu wykupu (przy zerwaniu w środku miesiąca — ułamek miesiąca przed krokiem t)
          boughtAt = boughtAt + term; age = Math.max(0, t - boughtAt);
          spec = roll; count = n; rates = periodRates(spec, cpiAt, nbpAt);
          costBasis = opts.taxBasisNominal ? NOMINAL : rollPrice; paidUpTo = 0;
        }
      }

      // wycena z końcem miesiąca t:
      //  "hold" (domyślnie) — trzymasz dalej: wartość po podatku od narosłych odsetek, bez opłaty za wykup;
      //  "liquidate" — wypłacasz wszystko: po opłacie i podatku.
      const v = bondValue(spec, age, rates, opts);
      const gross = (opts.valuation === "liquidate" && opts.payoutFee ? v.net : v.gross) * count;
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
   *   withdrawalTax: 0 | 0.1 (IKZE: ryczałt od całej wypłaty — wartości w czasie pomniejszone o ten podatek),
   *   buyPrice: 100, swapPrice: 99.9, roundPerBond: true,
   *   valuation: "hold" (domyślnie: jedyne zerwanie to zamiana dziś, dalej obie strony trzymają obligacje
   *              do wykupu i zamieniają po 99,90; wycena bez opłaty za wykup)
   *            | "liquidate" (wycena jak przy wypłacie wszystkiego, z opłatą)
   * }
   */
  /** Wspólny kontekst symulacji (stopy, podatek, wycena, cena zamiany) dla horyzontu H. */
  function buildCtx(p, H) {
    const now = p.now;
    const taxRate = p.taxRate != null ? p.taxRate : 0.19;
    const tax = p.tax !== false;
    const buyPrice = p.buyPrice || NOMINAL;
    const swapPrice = p.swapPrice || 99.9;
    const future = (p.cpiFuture && p.cpiFuture.length) ? p.cpiFuture : [2.5];
    const cpiAt = makeCpiAt(p.cpiHistory || {}, future, now);
    const nbpAt = makeNbpAt(p.nbpHistory || {}, p.nbpFuture, now);
    // taxBasisNominal: podatek od zysku liczony względem 100 zł także po zamianie po 99,90 (zgodność z arkuszem kontrolnym)
    const opts = { roundPerBond: p.roundPerBond !== false, taxBasisNominal: !!p.taxBasisNominal,
      valuation: p.valuation === "liquidate" ? "liquidate" : "hold",
      // wypłata z IKE/IKZE: bez opłaty za przedterminowy wykup (listy emisyjne) — dotyczy wyceny „wypłata wszystkiego”;
      // zerwanie dziś w celu zakupu nowych obligacji w ramach konta nie jest wypłatą, więc opłata zostaje
      payoutFee: tax };
    const rollover = Object.assign({}, p.rollover || p.target);
    const ctx = { H, cpiAt, nbpAt, tax, taxRate, savingsRate: p.savingsRate || 0, swapPrice, rollover, now, opts };
    return { ctx, future, taxRate, tax, buyPrice, opts, cpiAt, nbpAt };
  }
  function deflator(future, H) {
    const defl = [1];
    for (let t = 1; t <= H; t++) {
      const y = Math.min(Math.floor((t - 1) / 12), future.length - 1);
      defl.push(defl[t - 1] * Math.pow(1 + future[y] / 100, 1 / 12));
    }
    return defl;
  }

  function compare(p) {
    const now = p.now;
    const oldTerm = TYPES[p.old.type].term;
    // wiek w dniu zerwania: z dniem zakupu (old.purchaseDay) i dniem zerwania (breakDay) — z ułamkiem miesiąca
    const age0 = ageMonths(p.old.purchase, now, p.old.purchaseDay, p.breakDay);
    const toMaturity = oldTerm - age0;
    const H = Math.max(1, p.horizonMonths == null || p.horizonMonths === "maturity" ? Math.ceil(toMaturity - 1e-9) : Math.round(p.horizonMonths));
    const { ctx, future, taxRate, tax, buyPrice, opts, cpiAt, nbpAt } = buildCtx(p, H);

    const oldSpec = Object.assign({}, p.old);

    if (age0 < 0) throw new Error("Data zakupu jest późniejsza niż data zamiany");
    if (age0 >= TYPES[oldSpec.type].term) throw new Error("Obligacje są już po terminie wykupu");
    const oldRates = periodRates(oldSpec, cpiAt, nbpAt);

    // historia: wartość inwestycji od miesiąca zakupu do dziś (ta sama wycena co dalej) — obligacje po podatku
    // od narosłych odsetek plus kupony COI wypłacone do danego miesiąca (netto, bez oprocentowania)
    const histAt = (a) => {
      const v = bondValue(oldSpec, a, oldRates, opts);
      const gross = (opts.valuation === "liquidate" && opts.payoutFee ? v.net : v.gross) * p.old.count;
      const bonds = gross - (tax ? Math.max(0, gross - NOMINAL * p.old.count) * taxRate : 0);
      const coupons = v.coupons.reduce((sum, c) => sum + c.amount, 0) * p.old.count * (tax ? 1 - taxRate : 1);
      return { bonds, coupons };
    };
    const past = [];
    for (let a = 0; a <= age0 + 1e-9; a++) {
      const h = histAt(a);
      past.push({ t: a - age0, ym: addMonths(oldSpec.purchase, a), value: h.bonds + h.coupons });
    }
    if (age0 % 1 > 1e-9) { const h = histAt(age0); past.push({ t: 0, ym: now, value: h.bonds + h.coupons }); }
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
    const defl = deflator(future, H);

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
    // IKZE: zryczałtowany podatek (10%) od całej wypłaty po 65. roku życia — pomniejsza obie strony tak samo
    const wk = 1 - (p.withdrawalTax || 0);
    if (wk !== 1) {
      for (const m of months) for (const k of ["keep", "swap", "diff", "keepReal", "swapReal", "diffReal"]) m[k] *= wk;
      for (const e of past) e.value *= wk;
    }
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
      months, past, paidCoupons: paidCoupons * wk, withdrawalTax: p.withdrawalTax || 0, keepEvents: keep.events, swapEvents: swap.events,
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
    const toMat = pos.map((o) => TYPES[o.type].term - ageMonths(o.purchase, now, o.purchaseDay, p.breakDay));
    const H = Math.max(1, p.horizonMonths == null || p.horizonMonths === "maturity" ? Math.ceil(Math.max(...toMat) - 1e-9) : Math.round(p.horizonMonths));
    const results = pos.map((o) => compare(Object.assign({}, p, { old: o, horizonMonths: H })));
    const pick = results.map((r) => r.atHorizon.diff > 0);
    const anyPick = pick.some(Boolean);

    // wspólne reszty: reszty poniżej 100 zł z zerwanych serii łączymy przy dzisiejszym zakupie — gdy razem
    // starczą na kolejne obligacje, kupujemy je (pieniądze przechodzą z konta do nowej serii)
    const { ctx, future, buyPrice } = buildCtx(p, H);
    const defl = deflator(future, H), wk = 1 - (p.withdrawalTax || 0);
    const pooled = (which) => {
      const rest = results.reduce((s, r, i) => s + (which(i) ? r.switchNow.cashRest : 0), 0);
      const extra = p.poolRemainders === false ? 0 : Math.floor(rest / buyPrice + 1e-9);
      const series = extra > 0
        ? simulateLeg({ spec: Object.assign({}, p.target, { purchase: now }), count: extra, ageAt0: 0, cash0: -extra * buyPrice, costBasis: buyPrice }, ctx)
          .series.map((x) => x.total * wk)
        : null;
      return { extra, rest: rest - extra * buyPrice, series };
    };
    const poolAll = pooled(() => true), poolBest = pooled((i) => pick[i]);

    const months = [];
    for (let t = 0; t <= H; t++) {
      const m = { t, ym: results[0].months[t].ym, keep: 0, swapAll: 0, best: 0, keepReal: 0, swapAllReal: 0, bestReal: 0 };
      results.forEach((r, i) => {
        const x = r.months[t];
        m.keep += x.keep; m.swapAll += x.swap; m.best += pick[i] ? x.swap : x.keep;
        m.keepReal += x.keepReal; m.swapAllReal += x.swapReal; m.bestReal += pick[i] ? x.swapReal : x.keepReal;
      });
      if (poolAll.series) { m.swapAll += poolAll.series[t]; m.swapAllReal += poolAll.series[t] / defl[t]; }
      if (anyPick && poolBest.series) { m.best += poolBest.series[t]; m.bestReal += poolBest.series[t] / defl[t]; }
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

    const sumSwitch = (which, pool) => {
      const s = { valueBeforeFee: 0, fee: 0, tax: 0, proceeds: 0, newCount: 0, cashRest: 0, cost: 0 };
      results.forEach((r, i) => { if (!which(i)) return; for (const k in s) s[k] += r.switchNow[k]; });
      s.newCount += pool.extra; s.cashRest = pool.rest; s.pooledExtra = pool.extra;
      return s;
    };
    const lastBE = (k) => { let b = null; for (let t = H; t >= 0; t--) { if (months[t][k] >= 0) b = t; else break; } return b; };
    const last = months[H];
    return {
      now, horizonMonths: H, latestMaturity: results.map((r) => r.maturity).sort().pop(),
      positions: results.map((r, i) => ({ spec: pos[i], result: r, swap: pick[i], diff: r.atHorizon.diff, diffReal: r.atHorizon.diffReal })),
      anyPick, months, past,
      switchAll: sumSwitch(() => true, poolAll), switchBest: sumSwitch((i) => pick[i], poolBest),
      atHorizon: { keep: last.keep, swapAll: last.swapAll, best: last.best, diffAll: last.diffAll, diffBest: last.diffBest,
        keepReal: last.keepReal, swapAllReal: last.swapAllReal, bestReal: last.bestReal, diffAllReal: last.diffAllReal, diffBestReal: last.diffBestReal },
      breakEvenMonthAll: lastBE("diffAll"), breakEvenMonthBest: anyPick ? lastBE("diffBest") : null,
    };
  }

  /**
   * „Co kupić dziś?”: ta sama kwota w każdą z podanych serii kupionych dziś (po 100 zł), trzymanych do końca
   * horyzontu; przy wykupie w terminie zamiana na tę samą serię na dzisiejszych warunkach (cena zamiany serii,
   * a gdy jej nie ma — 100 zł). Reszta poniżej 100 zł i kupony na koncie.
   * p = { now, amount, horizonMonths, candidates: [{type, rate1, margin, fee, swapPrice?}], cpiHistory, cpiFuture,
   *       nbpHistory, nbpFuture, savingsRate, tax, withdrawalTax, swapBuy (zakup po cenie zamiany — pieniądze z wykupu
   *       w terminie; ROS/ROD bez ceny zamiany — po 100 zł), valuation: "liquidate" (domyślnie — wypłata
   *       wszystkiego na koniec, z opłatą i podatkiem) | "hold" }
   */
  function compareBuy(p) {
    const H = Math.max(1, Math.round(p.horizonMonths || 12));
    const amount = +p.amount || 0;
    const wk = 1 - (p.withdrawalTax || 0);
    const results = (p.candidates || []).map((c) => {
      const spec = { type: c.type, rate1: +c.rate1, margin: +(c.margin || 0), fee: +(c.fee || 0), purchase: p.now };
      const roll = Object.assign({}, spec, { swapPrice: c.swapPrice || TYPES[c.type].swapPrice || NOMINAL });
      delete roll.purchase;
      const { ctx, future, buyPrice, opts } = buildCtx(Object.assign({}, p, { valuation: p.valuation === "hold" ? "hold" : "liquidate",
        target: spec, rollover: roll }), H);
      // swapBuy: pieniądze z wykupu w terminie — zakup po cenie zamiany serii (99,90 zł; OTS 100,00 zł; ROS/ROD bez ceny zamiany — 100 zł)
      const price = p.swapBuy ? (c.swapPrice || TYPES[c.type].swapPrice || buyPrice) : buyPrice;
      const count = Math.floor(amount / price + 1e-9), cash0 = amount - count * price;
      const defl = deflator(future, H);
      const leg = simulateLeg({ spec, count, ageAt0: 0, cash0, costBasis: opts.taxBasisNominal ? NOMINAL : price }, ctx);
      const series = leg.series.map((x, t) => ({ t, ym: x.ym, total: x.total * wk, real: x.total * wk / defl[t] }));
      const last = series[H];
      return { type: c.type, count, cash0, buyPrice: price, series, events: leg.events, final: last.total, finalReal: last.real,
        gain: last.total - amount, annual: amount > 0 && last.total > 0 ? Math.pow(last.total / amount, 12 / H) - 1 : null,
        rates: periodRates(spec, ctx.cpiAt, ctx.nbpAt) };
    });
    const ranking = results.slice().sort((a, b) => b.final - a.final).map((r) => r.type);
    return { now: p.now, horizonMonths: H, amount, results, ranking };
  }

  /**
   * „Mój portfel”: stan posiadanych obligacji w dniu zerwania (miesiąc now, dzień breakDay) — bez zamiany.
   * p = { now, breakDay, positions: [{type, rate1, margin, fee, purchase, purchaseDay, count, code?}],
   *       cpiHistory, cpiFuture, nbpHistory, nbpFuture, tax, taxRate }
   * Dla każdej serii: wartość brutto (z narosłymi odsetkami), opłata i podatek przy zerwaniu dziś, wypłata na rękę,
   * odsetki wypłacone dotąd, bieżący okres (stopa, koniec), następny okres (stopa, czy znana z odczytów GUS/NBP),
   * najbliższy kupon (COI, ROR, DOR) i wykup w terminie (wartość przy obecnych założeniach) oraz kupony należne do wykupu
   * (futureCoupons; toMaturity = wykup + kupony). p.cpiPrelim = {"RRRR-MM": true} — odczyty CPI z szybkiego szacunku GUS
   * (stopy na ich podstawie: next.prelim, maturityPrelim). Kwoty za wszystkie sztuki.
   */
  function holdings(p) {
    const taxRate = p.taxRate != null ? p.taxRate : 0.19, tax = p.tax !== false;
    const future = (p.cpiFuture && p.cpiFuture.length) ? p.cpiFuture : [2.5];
    const cpiAt = makeCpiAt(p.cpiHistory || {}, future, p.now), nbpAt = makeNbpAt(p.nbpHistory || {}, p.nbpFuture, p.now);
    const taxOf = (g) => tax ? r2(Math.max(0, g) * taxRate) : 0;
    const net = (g) => tax ? g * (1 - taxRate) : g;
    const items = (p.positions || []).map((o) => {
      const t = TYPES[o.type], P = periodOf(o.type), n = o.count;
      const age = ageMonths(o.purchase, p.now, o.purchaseDay, p.breakDay);
      const maturity = addMonths(o.purchase, t.term);
      if (age < 0) return { spec: o, error: "future", maturity, age };
      if (age >= t.term - 1e-9) return { spec: o, matured: true, maturity, age };
      const rates = periodRates(o, cpiAt, nbpAt);
      // stopa okresu idx: "final" — z opublikowanych danych (CPI za P−2, stopa NBP na początek okresu); "prelim" — z szybkiego
      // szacunku CPI (p.cpiPrelim[ym], odczyt finalny może się różnić); false — jeszcze nieznana (scenariusz)
      const known = (idx) => {
        if (idx === 0 || (!t.indexed && !t.nbp)) return "final";
        const start = addMonths(o.purchase, idx * P);
        if (t.nbp) return p.nbpHistory && p.nbpHistory[start] != null ? "final" : false;
        const cm = addMonths(start, -2);
        if (!(p.cpiHistory && p.cpiHistory[cm] != null)) return false;
        return p.cpiPrelim && p.cpiPrelim[cm] ? "prelim" : "final";
      };
      const v = bondValue(o, age, rates, { roundPerBond: true });
      const gross = v.gross * n, fee = v.fee * n;
      const redeem = redeemWindow(o.type, o.purchase, o.purchaseDay, p.now, p.breakDay);
      const breakTax = taxOf(gross - fee - NOMINAL * n);
      const k = Math.floor(age / P + 1e-9);
      const periodEnd = addMonths(o.purchase, Math.min((k + 1) * P, t.term));
      const next = (k + 1) * P < t.term ? {
        start: periodEnd, rate: rates[k + 1], known: !!known(k + 1), prelim: known(k + 1) === "prelim",
        basis: t.nbp ? nbpAt(periodEnd) : t.indexed ? cpiAt(addMonths(periodEnd, -2)) : null,
        basisMonth: t.indexed ? addMonths(periodEnd, -2) : null,
      } : null;
      const coupon = t.coupon ? { ym: periodEnd, gross: couponAmount(o.type, rates[k], true) * n } : null;
      if (coupon) coupon.net = coupon.gross - taxOf(coupon.gross);
      // wykup w terminie: kapitalizowane — wartość końcowa; COI/ROR/DOR — 100 zł + ostatni kupon
      const last = Math.ceil(t.term / P) - 1;
      const mv = bondValue(o, t.term, rates, { roundPerBond: true });
      const atMaturity = t.coupon
        ? NOMINAL * n + couponAmount(o.type, rates[last], true) * n * (tax ? 1 - taxRate : 1)
        : mv.gross * n - taxOf((mv.gross - NOMINAL) * n);
      let maturityKnown = true, maturityPrelim = false;
      for (let i = k + 1; i <= last; i++) { const kn = known(i); if (!kn) maturityKnown = false; else if (kn === "prelim") maturityPrelim = true; }
      // kupony (COI) i odsetki (ROR, DOR) należne od bieżącego okresu do przedostatniego — po podatku; ostatni jest w atMaturity
      let futureCoupons = 0;
      if (t.coupon) for (let i = k; i < last; i++) { const c = couponAmount(o.type, rates[i], true) * n; futureCoupons += c - taxOf(c); }
      // harmonogram do wykupu (kalendarz): kupon/odsetki na koniec okresu (bez ostatniego — jest w wykupie), nowe oprocentowanie
      // od kolejnego okresu (EDO/COI/ROS/ROD co rok; ROR/DOR tylko przy zmianie stopy), wykup; known: "final" | "prelim" | false
      const schedule = [];
      for (let i = k; i <= last; i++) {
        const endYm = addMonths(o.purchase, Math.min((i + 1) * P, t.term));
        if (t.coupon && i < last) { const c = couponAmount(o.type, rates[i], true) * n; schedule.push({ ym: endYm, kind: "kupon", period: i + 1, rate: rates[i], amount: c - taxOf(c), known: known(i) }); }
        if (i < last && (t.indexed || (t.nbp && Math.abs(rates[i + 1] - rates[i]) > 1e-12)))
          schedule.push({ ym: endYm, kind: "stopa", period: i + 2, rate: rates[i + 1], prev: rates[i], known: known(i + 1) });
      }
      schedule.push({ ym: maturity, kind: "wykup", amount: atMaturity, known: maturityKnown ? (maturityPrelim ? "prelim" : "final") : false });
      return {
        spec: o, age, maturity, monthsToMaturity: t.term - age, rates, schedule,
        gross, fee, breakTax, payout: gross - fee - breakTax, redeem,
        hold: gross - taxOf(gross - NOMINAL * n),
        couponsPaid: net(v.coupons.reduce((s, c) => s + c.amount, 0) * n),
        rateNow: rates[k], periodIndex: k, periodEnd, next, coupon,
        atMaturity, futureCoupons, toMaturity: atMaturity + futureCoupons, maturityKnown, maturityPrelim,
      };
    });
    return { now: p.now, breakDay: p.breakDay, items };
  }

  /**
   * „Jak wypadła seria”: 1 obligacja (100 zł) kupiona w miesiącu emisji, trzymana do `now` albo do wykupu w terminie,
   * jeśli był wcześniej. Kupony (COI, ROR, DOR) po podatku, bez oprocentowania.
   * p = { spec: {type, rate1, margin, fee, purchase}, now, cpiHistory, cpiYtd, nbpHistory, tax, taxRate,
   *       valuation: "hold" (seria w trakcie — wartość bez opłaty, po podatku od narosłych odsetek) | "liquidate" (wypłata dziś) }
   * Inflacja w tym czasie: zmiana poziomu cen GUS w miesiącach od zakupu do miesiąca przed końcem, P(koniec−1) / P(zakup−1)
   * z łańcucha „grudzień poprzedniego roku = 100” (cpiYtd); miesiące bez tego odczytu — przybliżenie z CPI r/r
   * (brakujące najnowsze odczyty = ostatni znany). inflationExact = wszystkie miesiące z łańcucha GUS.
   */
  function seriesOutcome(p) {
    const o = p.spec, t = TYPES[o.type];
    if (!t) return null;
    const taxRate = p.taxRate != null ? p.taxRate : 0.19, tax = p.tax !== false;
    const maturity = addMonths(o.purchase, t.term);
    const matured = monthsBetween(maturity, p.now) >= 0;
    const end = matured ? maturity : p.now;
    const age = monthsBetween(o.purchase, end);
    if (age < 1) return null;
    const keys = Object.keys(p.cpiHistory || {}).sort();
    const lastCpi = keys.length ? p.cpiHistory[keys[keys.length - 1]] : 0;
    const cpiAt = makeCpiAt(p.cpiHistory || {}, [lastCpi], keys.length ? keys[keys.length - 1] : p.now);
    const nbpAt = makeNbpAt(p.nbpHistory || {}, null, p.now);
    const rates = periodRates(o, cpiAt, nbpAt);
    const v = bondValue(o, age, rates, { roundPerBond: true });
    const coupons = v.coupons.reduce((s, c) => s + (tax ? c.amount - r2(c.amount * taxRate) : c.amount), 0);
    const value = !matured && p.valuation === "liquidate" ? v.net : v.gross;
    const total = value - (tax ? r2(Math.max(0, value - NOMINAL) * taxRate) : 0) + coupons;
    // dokładnie z dwóch końców łańcucha, gdy oba są znane; inaczej miesiąc po miesiącu z przybliżeniem tam, gdzie brak odczytu
    const level = makePriceLevel(p.cpiYtd), la = level(addMonths(end, -1)), lb = level(addMonths(o.purchase, -1));
    let infl = 1, exact = true;
    if (la != null && lb != null) infl = la / lb;
    else {
      const step = makeInflationStep(p.cpiYtd, cpiAt);
      for (let m = 0; m < age; m++) { const ym = addMonths(o.purchase, m); infl *= step(ym); if (!step.exact(ym)) exact = false; }
    }
    const nominal = total / NOMINAL - 1, real = (1 + nominal) / infl - 1;
    return {
      matured, maturity, end, age, total, coupons, nominal, inflation: infl - 1, inflationExact: exact, real,
      annual: Math.pow(1 + nominal, 12 / age) - 1, realAnnual: Math.pow(1 + real, 12 / age) - 1, rates,
    };
  }

  /** Stała przyszła inflacja, przy której różnica na koniec horyzontu = 0 (bisekcja). */
  function breakEvenInflation(p, lo = -2, hi = 25) {
    const f = (c) => compare(Object.assign({}, p, { cpiFuture: [c] })).atHorizon.diff;
    if (Math.abs(f(lo) - f(hi)) < 0.005) return { independent: true, sign: Math.sign(f(lo)) };
    return bisect(f, lo, hi);
  }

  /**
   * Stała przyszła stopa referencyjna NBP (ROR/DOR), przy której różnica na koniec horyzontu = 0.
   * Zwraca liczbę, {none, sign} gdy znak się nie zmienia w [lo, hi], albo {independent: true},
   * gdy wynik nie zależy od stopy NBP (brak ROR/DOR w porównaniu).
   */
  function breakEvenNbp(p, lo = 0, hi = 15) {
    const f = (r) => compare(Object.assign({}, p, { nbpFuture: r })).atHorizon.diff;
    if (Math.abs(f(lo) - f(hi)) < 0.005) return { independent: true, sign: Math.sign(f(lo)) };
    return bisect(f, lo, hi);
  }

  /** Bisekcja: x z [lo, hi], dla którego f(x) ≈ 0; {none, sign, low} gdy znak się nie zmienia. */
  function bisect(f, lo, hi) {
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

  /**
   * Poziom cen z łańcucha GUS „grudzień poprzedniego roku = 100”: ytd = {"RRRR-MM": wskaźnik − 100}.
   * P(ym) = Π (1 + ytd[grudzień k]/100) po latach przed rokiem ym × (1 + ytd[ym]/100), od grudnia roku sprzed
   * najstarszego odczytu (= 1). To oficjalny sposób liczenia zmiany cen w dłuższym okresie: dla grudnia daje dokładnie
   * wskaźnik r/r, a przy zaokrągleniu do 0,1 błąd nie narasta z każdym miesiącem. Zwraca null, gdy brakuje danych.
   */
  function makePriceLevel(ytd) {
    const keys = Object.keys(ytd || {}).sort();
    if (!keys.length) return () => null;
    const baseYear = +keys[0].slice(0, 4) - 1;
    return function (ym) {
      if (ym === `${baseYear}-12`) return 1;
      const y = +ym.slice(0, 4);
      if (y <= baseYear || ytd[ym] == null) return null;
      let f = 1 + ytd[ym] / 100;
      for (let k = baseYear + 1; k < y; k++) { const d = ytd[`${k}-12`]; if (d == null) return null; f *= 1 + d / 100; }
      return f;
    };
  }

  /**
   * Inflacja w miesiącu ym jako mnożnik: P(ym) / P(ym−1) z łańcucha GUS (makePriceLevel), a gdy brak danych —
   * przybliżenie (1 + CPI r/r za ym)^(1/12) (scenariusz w przyszłości, najnowsze miesiące bez odczytu).
   */
  function makeInflationStep(ytd, cpiAt) {
    const level = makePriceLevel(ytd);
    const step = function (ym) {
      const a = level(ym), b = level(addMonths(ym, -1));
      if (a != null && b != null) return a / b;
      return Math.pow(1 + Math.max(-50, cpiAt(ym)) / 100, 1 / 12);
    };
    step.exact = (ym) => level(ym) != null && level(addMonths(ym, -1)) != null;
    return step;
  }

  /** Historia „grudzień poprzedniego roku = 100” z data/months.json: {"RRRR-MM" (cpiRefMonth): cpiYtd}. */
  function cpiYtdFromMonths(monthsObj) {
    const h = {};
    for (const rec of Object.values(monthsObj)) if (rec && rec.cpiRefMonth && typeof rec.cpiYtd === "number") h[rec.cpiRefMonth] = rec.cpiYtd;
    return h;
  }

  /** Historia CPI z data/months.json: {"RRRR-MM" (miesiąc odczytu): %}. */
  function cpiHistoryFromMonths(monthsObj) {
    const h = {};
    for (const rec of Object.values(monthsObj)) {
      if (rec && rec.cpiRefMonth && typeof rec.cpi === "number") h[rec.cpiRefMonth] = rec.cpi;
    }
    return h;
  }

  /**
   * Tabela posiadanych obligacji wklejona z rachunku: eksport „Stan rachunku rejestrowego” (EMISJA, DOSTĘPNA LICZBA
   * OBLIGACJI, ZABLOKOWANA LICZBA OBLIGACJI, WARTOŚĆ NOMINALNA, WARTOŚĆ AKTUALNA, DATA WYKUPU) skopiowany z arkusza
   * lub strony, z tabulatorami, średnikami albo spacjami. Z nagłówkiem kolumny rozpoznawane po nazwach
   * (sztuki = dostępne + zablokowane); bez nagłówka pierwsza liczba całkowita po kodzie to liczba sztuk.
   * Dzień zakupu = dzień z daty w miesiącu zakupu albo wykupu serii (wykup przypada w rocznicę zakupu).
   * Ta sama seria i dzień → jedna pozycja (sztuki zsumowane), różne dni → osobne pozycje.
   * Zwraca { rows: [{ code, n, blocked, day }], skipped: [{ line, reason }] }; day = null, gdy brak pasującej daty.
   */
  function parseRegister(text) {
    const norm = (x) => String(x).replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
    const intOf = (x) => { const t = norm(x || "").replace(/ /g, ""); return /^\d+$/.test(t) ? +t : null; };
    const CODE = /\b([A-Za-z]{3}\d{4})\b/, DATES = /\d{4}-\d{2}-\d{2}|\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}/g;
    const zl = (v) => v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " zł";
    // kwota z groszami („20 000,00”) → liczba; null, gdy to nie kwota
    const amountOf = (x) => { const t = norm(x || ""); return /^\d{1,3}( \d{3})*,\d{2}$|^\d+,\d{2}$/.test(t) ? +t.replace(/ /g, "").replace(",", ".") : null; };
    // tokeny jednej liczby z tysiącami rozdzielonymi spacją: pierwszy 1–3 cyfry, kolejne po 3 (albo jeden token dowolnej długości)
    const grp = (t) => !t.length ? null : t.length === 1 ? (/^\d+$/.test(t[0]) ? +t[0] : null)
      : /^\d{1,3}$/.test(t[0]) && t.slice(1).every((x) => /^\d{3}$/.test(x)) ? +t.join("") : null;
    // tokeny po kodzie (spacje): [sztuki dostępne] [zablokowane] [wartość nominalna z groszami] … — wybór podziału, przy którym
    // (dostępne + zablokowane) × 100 zł = wartość nominalna; bez kwoty — pierwsza i druga liczba (tysiące sklejone, uncertain)
    const spaceCounts = (toks) => {
      const k = toks.findIndex((t) => /^\d+,\d{2}$/.test(t)), lead = [];
      for (const t of (k < 0 ? toks : toks.slice(0, k))) { if (/^\d+$/.test(t)) lead.push(t); else break; }
      let cnt = lead, nominal = null;
      if (k >= 0 && lead.length === k) {
        const [ip, gr] = toks[k].split(",");
        for (let s = k; s >= 1; s--) {
          const v = grp([...lead.slice(s), ip]);
          if (v == null) continue;
          const nom = v + +gr / 100, c = lead.slice(0, s);
          if (nominal == null || s < cnt.length) { nominal = nom; cnt = c; } // najdłuższa poprawna kwota — do ostrzeżenia
          for (let j = 1; j <= s; j++) {
            const a = grp(c.slice(0, j)), b = j < s ? grp(c.slice(j)) : 0;
            if (a != null && b != null && Math.abs((a + b) * 100 - nom) < 0.005) return { n: a, blocked: b, nominal: nom };
          }
        }
      }
      if (!cnt.length) return null;
      const take = (i) => { let j = i + 1; while (j < cnt.length && /^\d{3}$/.test(cnt[j]) && /^\d{1,3}$/.test(cnt[i])) j++; return [grp(cnt.slice(i, j)), j]; };
      const [a, i2] = take(0), [b] = i2 < cnt.length ? take(i2) : [0];
      return { n: a, blocked: b || 0, nominal, uncertain: nominal == null && cnt.length > 1 && (i2 > 1 || cnt.length > 2) };
    };
    const rows = [], skipped = [], seen = new Map();
    let cols = null;
    for (const raw of String(text || "").replace(/\r/g, "").split("\n")) {
      const line = norm(raw);
      if (!line) continue;
      const sep = raw.includes("\t") ? "\t" : raw.includes(";") ? ";" : null;
      const fields = sep ? raw.split(sep).map(norm) : null;
      const cm = CODE.exec(line);
      if (!cm) {
        const up = line.toUpperCase();
        if (fields && /EMISJA|SERIA|KOD/.test(up) && /LICZBA|SZT|ILO/.test(up)) {
          const find = (re, not) => fields.findIndex((f) => re.test(f.toUpperCase()) && !(not && not.test(f.toUpperCase())));
          cols = { code: find(/EMISJA|SERIA|KOD/), n: find(/DOST/) >= 0 ? find(/DOST/) : find(/LICZBA|SZT|ILO/, /ZABLOK/),
            blocked: find(/ZABLOK/), nom: find(/NOMINAL/) };
        } else if (/\d/.test(line)) skipped.push({ line, reason: "brak kodu serii" });
        continue;
      }
      const code = cm[1].toUpperCase(), info = parseCode(code);
      if (!info) { skipped.push({ line, reason: `nieznany rodzaj obligacji ${code.slice(0, 3)}` }); continue; }
      let n = null, blocked = 0, nominal = null, warn = null;
      if (fields && cols && cols.n >= 0 && fields[cols.code] && CODE.test(fields[cols.code])) {
        n = intOf(fields[cols.n]);
        if (cols.blocked >= 0) blocked = intOf(fields[cols.blocked]) || 0;
        nominal = amountOf(cols.nom >= 0 ? fields[cols.nom] : fields.find((f) => amountOf(f) != null));
      } else if (fields) {
        // kolumny rozdzielone tabulatorem/średnikiem, bez nagłówka: sztuki dostępne, zablokowane, wartość nominalna…
        const after = fields.slice(fields.findIndex((f) => CODE.test(f)) + 1), ints = [];
        for (const f of after) { const v = intOf(f); if (v == null) break; ints.push(v); }
        if (ints.length) { n = ints[0]; blocked = ints[1] || 0; }
        nominal = amountOf(after.find((f) => amountOf(f) != null));
      } else {
        // kolumny rozdzielone spacjami: „1 000” może być tysiącem albo dwiema kolumnami — rozstrzyga wartość nominalna
        const toks = line.slice(cm.index + cm[0].length).replace(DATES, " ").split(" ").filter(Boolean);
        const r = spaceCounts(toks);
        if (r) { n = r.n; blocked = r.blocked; nominal = r.nominal; if (r.uncertain) warn = `${code}: sprawdź liczbę sztuk — kolumny rozdzielone spacjami nie są jednoznaczne`; }
      }
      if (n == null) { skipped.push({ line, reason: `${code}: nie znaleziono liczby sztuk` }); continue; }
      const total = n + blocked;
      if (nominal != null && Math.abs(total * 100 - nominal) > 0.005 && Math.abs(n * 100 - nominal) > 0.005)
        warn = `${code}: ${total} szt., a wartość nominalna ${zl(nominal)} (${total} szt. × 100 zł = ${zl(total * 100)}) — sprawdź liczbę sztuk`;
      if (!(total >= 1)) { skipped.push({ line, reason: `${code}: 0 sztuk` }); continue; }
      let day = null;
      const mat = addMonths(info.purchase, TYPES[info.type].term);
      for (const d of line.matchAll(/(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/g)) {
        const ym = d[1] ? `${d[1]}-${d[2]}` : `${d[6]}-${String(d[5]).padStart(2, "0")}`, dd = +(d[3] || d[4]);
        if ((ym === info.purchase || ym === mat) && dd >= 1 && dd <= 31) { day = dd; break; }
      }
      const key = code + "~" + day;
      if (seen.has(key)) { const r = seen.get(key); r.n += total; r.blocked += blocked; if (warn) r.warn = r.warn ? r.warn + "; " + warn : warn; continue; }
      const r = { code, n: total, blocked, day };
      if (warn) r.warn = warn;
      seen.set(key, r);
      rows.push(r);
    }
    return { rows, skipped };
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

  const api = { TYPES, NOMINAL, parseCode, periodRates, bondValue, compare, comparePortfolio, compareBuy, holdings, seriesOutcome, breakEvenInflation, breakEvenNbp,
    cpiHistoryFromMonths, cpiYtdFromMonths, makePriceLevel, makeInflationStep, nbpHistoryFromMonths, ageMonths, redeemWindow, makeNbpAt, couponAmount, seriesFromArchive, parseRegister, addMonths, monthsBetween, simulateLeg, makeCpiAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Zamiana = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
