#!/usr/bin/env python3
"""Kontrola rekordu miesiąca w data/months.json z oficjalnymi źródłami.

Niczego nie zapisuje. Sprawdza:
  - czy istnieje rekord bieżącego miesiąca (lub podanego jako argument RRRR-MM),
  - czy kody serii zgadzają się z ofertą na obligacjeskarbowe.pl,
  - oprocentowanie 1. okresu, marżę, opłatę za przedterminowy wykup i cenę zamiany
    każdej serii z listem emisyjnym (PDF, odczyt przez pdftotext),
  - stopę referencyjną NBP obowiązującą 1. dnia miesiąca (archiwum XML NBP) oraz to, czy dla miesięcy od 06.2022
    równa się stopie z 10. dnia roboczego przed miesiącem (od niej list liczy ROR/DOR, silnik — od nbpRef);
    różnica w kontrolowanym rekordzie = błąd, w archiwum = ostrzeżenie,
  - czy CPI w rekordzie dotyczy poprzedniego miesiąca, a od 18. dnia miesiąca
    (i zawsze dla wcześniejszych miesięcy) czy jest już odczytem finalnym GUS
    (szybki szacunek GUS zastępuje odczytem finalnym ok. 15. dnia); przy odczycie finalnym także cpiYtd
    (zmiana cen od grudnia poprzedniego roku),
  - wartości CPI z tablicą GUS „Miesięczne wskaźniki cen towarów i usług konsumpcyjnych od 1982 roku”
    (CSV w cp1250, link odczytywany ze strony tablicy): w rekordzie miesiąca cpi i cpiYtd przy odczycie finalnym,
    a do tego całe archiwum (months.json z odczytem finalnym i data/przed-2019.json). Rozbieżność > 0,05 p.p. = błąd;
    niedostępność GUS albo brak miesiąca w tablicy = ostrzeżenie (nie blokuje kontroli NBP i list emisyjnych).

Kod wyjścia 1, gdy coś się nie zgadza albo nie da się tego odczytać.
Użycie: python3 scripts/check_offer.py [RRRR-MM]
Zmienna CHECK_TODAY=RRRR-MM-DD podmienia dzisiejszą datę (do testów),
CHECK_GUS_CSV=ścieżka — tablicę GUS z pliku zamiast pobierania (do testów), CHECK_NBP_XML=ścieżka — archiwum NBP z pliku.
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.obligacjeskarbowe.pl"
NBP_XML = "https://static.nbp.pl/dane/stopy/stopy_procentowe_archiwum.xml"
GUS_PAGE = ("https://stat.gov.pl/obszary-tematyczne/ceny-handel/wskazniki-cen/wskazniki-cen-towarow-i-uslug-konsumpcyjnych-pot-inflacja-/"
            "miesieczne-wskazniki-cen-towarow-i-uslug-konsumpcyjnych-od-1982-roku/")
GUS_TOL = 0.05  # p.p.; GUS podaje wskaźniki z jednym miejscem po przecinku
UA = "rejestr-obligacji-check/1.0 (+https://github.com/patrykw-labs/rejestr-obligacji)"

errors, warns, oks = [], [], []


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", errors="replace")


def num(s):
    return float(s.replace(",", "."))


def fmt(v):
    return "–" if v is None else (f"{v:.2f}".replace(".", ",") if isinstance(v, (int, float)) else str(v))


def check(label, expected, found):
    """Porównanie wartości z rekordu (expected) z wartością z listu (found)."""
    if found is None:
        errors.append(f"{label}: nie udało się odczytać z listu (w rejestrze {fmt(expected)})")
    elif isinstance(expected, (int, float)) and isinstance(found, (int, float)):
        if abs(expected - found) > 1e-9:
            errors.append(f"{label}: w rejestrze {fmt(expected)}, w liście {fmt(found)}")
        else:
            oks.append(f"{label}: {fmt(found)}")
    elif expected != found:
        errors.append(f"{label}: w rejestrze {fmt(expected)}, w liście {fmt(found)}")
    else:
        oks.append(f"{label}: {fmt(found)}")


def pdf_text(data):
    with tempfile.TemporaryDirectory() as td:
        p = Path(td) / "list.pdf"
        p.write_bytes(data)
        out = subprocess.run(["pdftotext", "-layout", str(p), "-"], capture_output=True, check=True)
    return " ".join(out.stdout.decode("utf-8", errors="replace").split())


def parse_letter(t):
    def first(pattern):
        m = re.search(pattern, t, re.I)
        return num(m.group(1)) if m else None

    rate1 = first(r"W pierwszym okresie odsetkowym stopa procentowa wynosi (\d+,\d+)\s?%") \
        or first(r"Oprocentowanie obligacji (?:jest stałe i )?wynosi (\d+,\d+)\s?%")
    fixed = bool(re.search(r"Oprocentowanie obligacji (?:jest stałe|wynosi \d+,\d+\s?% w stosunku rocznym i jest stałe)", t, re.I))
    margin = first(r"marż[ęy] w wysokości (\d+,\d+)\s?%")
    swap = first(r"Cena zamiany jednej obligacji wynosi (\d+,\d+) zł")
    fee = first(r"nie wyższą niż (\d+,\d+) zł")
    if fee is None and re.search(r"odsetki od obligacji nie przysługują", t, re.I):
        fee = "brak odsetek"
    return {"rate1": rate1, "margin": None if fixed else margin, "fee": fee, "swapPrice": swap, "fixed": fixed}


_NBP = []


def nbp_ref_history():
    """Stopa referencyjna NBP: [(obowiązuje_od "RRRR-MM-DD", %)] rosnąco (archiwum XML, raz na przebieg; CHECK_NBP_XML = plik)."""
    if not _NBP:
        raw = Path(os.environ["CHECK_NBP_XML"]).read_bytes() if os.environ.get("CHECK_NBP_XML") else fetch(NBP_XML, binary=True)
        hist = {}
        for poz in ET.fromstring(raw).iter("pozycje"):
            since = poz.get("obowiazuje_od")
            for q in poz.iter("pozycja"):
                if since and q.get("id") == "ref":
                    hist[since] = num(q.get("oprocentowanie"))
        _NBP.extend(sorted(hist.items()))
    return _NBP


def nbp_ref_on(day):
    best = None
    for since, rate in nbp_ref_history():
        if since <= day.isoformat():
            best = (since, rate)
    return best


def easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    g = (8 * b + 13) // 25
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 19 * l) // 433
    month = (h + l - 7 * m + 90) // 25
    return dt.date(y, month, (h + l - 7 * m + 33 * month + 19) % 32)


def pl_holiday(day):
    """Dni ustawowo wolne od pracy w Polsce (niedziele sprawdza is_business_day)."""
    fixed = {(1, 1), (1, 6), (5, 1), (5, 3), (8, 15), (11, 1), (11, 11), (12, 25), (12, 26)}
    if (day.month, day.day) in fixed or (day.year >= 2025 and (day.month, day.day) == (12, 24)):
        return True
    e = easter(day.year)
    return day in (e + dt.timedelta(days=1), e + dt.timedelta(days=60))  # poniedziałek wielkanocny, Boże Ciało


def business_days_before(first_day, n=10):
    """n-ty dzień roboczy przed first_day (list ROR/DOR: stopa NBP „obowiązująca w dziesiątym dniu roboczym przed
    pierwszym dniem miesiąca” okresu odsetkowego)."""
    d, k = first_day, 0
    while k < n:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5 and not pl_holiday(d):
            k += 1
    return d


ROR_FROM = "2022-06"  # ROR/DOR zmienne wg stopy NBP


def check_nbp_ror(data, month):
    """Silnik liczy ROR/DOR od nbpRef (stopa z 1. dnia miesiąca), a list — od stopy z 10. dnia roboczego przed miesiącem.
    Różnią się, gdy NBP zmienił stopę w tych ostatnich dniach roboczych. Rekord kontrolowanego miesiąca → błąd, archiwum → ostrzeżenie."""
    bad = []
    for ym in sorted(k for k in data if k >= ROR_FROM):
        y, m = map(int, ym.split("-"))
        first = dt.date(y, m, 1)
        tday = business_days_before(first)
        at_t, at_1 = nbp_ref_on(tday), nbp_ref_on(first)
        if at_t and at_1 and at_t[1] != at_1[1]:
            msg = (f"ROR/DOR {ym}: stopa NBP w 10. dniu roboczym przed miesiącem ({tday.isoformat()}) to {fmt(at_t[1])}%, "
                   f"a 1. dnia miesiąca (nbpRef) {fmt(at_1[1])}% — zmiana od {at_1[0]}; silnik policzy okresy ROR/DOR z {ym} "
                   "od nbpRef, a według listu obowiązuje stopa sprzed zmiany")
            (errors if ym == month else warns).append(msg)
            bad.append(ym)
    if not bad:
        oks.append(f"stopa NBP z 10. dnia roboczego przed miesiącem = nbpRef we wszystkich miesiącach od {ROR_FROM} (ROR/DOR)")
    return bad


def gus_cpi():
    """Tablica GUS: {"RRRR-MM": {"yoy": r/r w %, "ytd": zmiana od grudnia w %}} albo None (z ostrzeżeniem), gdy niedostępna."""
    try:
        if os.environ.get("CHECK_GUS_CSV"):
            raw, src = Path(os.environ["CHECK_GUS_CSV"]).read_bytes(), os.environ["CHECK_GUS_CSV"]
        else:
            links = re.findall(r'href="([^"]+\.csv)"', fetch(GUS_PAGE))
            if not links:
                raise ValueError("brak linku do CSV na stronie tablicy")
            src = urllib.parse.urljoin(GUS_PAGE, links[0])
            raw = fetch(src, binary=True)
        out = {}
        kinds = {"Analogiczny miesiąc poprzedniego roku = 100": "yoy", "Grudzień poprzedniego roku = 100": "ytd"}
        for line in raw.decode("cp1250").splitlines():
            f = line.split(";")
            if len(f) < 6 or f[1] != "Polska" or f[2] not in kinds or not f[5].strip():
                continue
            ym = f"{int(f[3]):04d}-{int(f[4]):02d}"
            out.setdefault(ym, {})[kinds[f[2]]] = round(num(f[5]) - 100, 2)
        if not out:
            raise ValueError("nie rozpoznano wierszy tablicy")
        return out, src.rsplit("/", 1)[-1]
    except Exception as e:  # sieć, zmiana strony lub formatu
        warns.append(f"tablica CPI z GUS niedostępna ({type(e).__name__}: {e}) — wartości CPI nie zostały porównane")
        return None, None


def gus_diff(label, ours, theirs):
    """Rozbieżność wartości z rekordu i z GUS (w %) albo None, gdy zgodne."""
    if theirs is None or ours is None or abs(ours - theirs) <= GUS_TOL + 1e-9:
        return None
    return f"{label}: w rejestrze {fmt(ours)}, w GUS {fmt(theirs)}"


def check_gus_archive(data, gus, month):
    """Całe archiwum: CPI r/r i cpiYtd w months.json (odczyty finalne) i w data/przed-2019.json."""
    bad, n = [], 0
    for ym, rec in sorted(data.items()):
        ref = rec.get("cpiRefMonth")
        if ym == month or rec.get("cpiKind") != "finalny" or not ref or ref not in gus:
            continue
        g = gus[ref]
        for key, gk, name in (("cpi", "yoy", "CPI r/r"), ("cpiYtd", "ytd", "cpiYtd")):
            if rec.get(key) is not None and g.get(gk) is not None:
                n += 1
                d = gus_diff(f"{ym}: {name} za {ref}", rec[key], g[gk])
                if d:
                    bad.append(d)
    pre = json.loads((ROOT / "data" / "przed-2019.json").read_text(encoding="utf-8")).get("cpi") or {}
    for key, gk, name in (("values", "yoy", "CPI r/r"), ("ytd", "ytd", "cpiYtd")):
        for ref, v in sorted((pre.get(key) or {}).items()):
            if v is not None and (gus.get(ref) or {}).get(gk) is not None:
                n += 1
                d = gus_diff(f"przed-2019.json: {name} za {ref}", v, gus[ref][gk])
                if d:
                    bad.append(d)
    errors.extend(bad)
    if not bad:
        oks.append(f"archiwum CPI zgodne z GUS ({n} wartości: CPI r/r i cpiYtd w months.json i przed-2019.json)")


def main():
    tz = ZoneInfo("Europe/Warsaw")
    today = dt.date.fromisoformat(os.environ["CHECK_TODAY"]) if os.environ.get("CHECK_TODAY") else dt.datetime.now(tz).date()
    month = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else today.strftime("%Y-%m")
    y, m = map(int, month.split("-"))
    first_day = dt.date(y, m, 1)
    prev = (first_day - dt.timedelta(days=1)).strftime("%Y-%m")

    data = json.loads((ROOT / "data" / "months.json").read_text(encoding="utf-8"))
    rec = data.get(month)
    print(f"Kontrola rekordu {month}")
    if rec is None:
        errors.append(f"brak rekordu {month} w data/months.json (miesięczna aktualizacja się nie odbyła?)")
        return report(month)

    cur = today.strftime("%Y-%m")
    if month < cur:
        oks.append(f"serie i listy emisyjne pominięte: strona oferty pokazuje bieżące serie, a rekord {month} dotyczy wcześniejszego miesiąca")
        check_macro(rec, month, first_day, prev, today, cur)
        check_gus(data, rec, month, prev)
        return report(month)

    # Oferta: kody serii na stronie vs rekord
    offer = fetch(BASE + "/oferta-obligacji/")
    links = dict()
    for path, code in re.findall(r'href="(/oferta-obligacji/obligacje-[a-z0-9-]+/([a-z]{3}\d{4})/)"', offer, re.I):
        links[code.upper()] = path
    site_codes = set(links)
    rec_codes = {s["code"] for s in rec["series"].values()}
    if site_codes != rec_codes:
        if site_codes - rec_codes:
            errors.append("w ofercie są serie, których nie ma w rejestrze: " + ", ".join(sorted(site_codes - rec_codes)))
        if rec_codes - site_codes:
            errors.append("w rejestrze są serie, których nie ma w ofercie: " + ", ".join(sorted(rec_codes - site_codes)))
    else:
        oks.append(f"serie w ofercie: {', '.join(sorted(site_codes))}")

    # Listy emisyjne
    for sym, s in sorted(rec["series"].items()):
        code = s["code"]
        path = links.get(code)
        if not path:
            continue
        page = fetch(BASE + path)
        text = None
        for pdf in dict.fromkeys(re.findall(r'href="(/media_files/[^"]+\.pdf)"', page)):
            t = pdf_text(fetch(BASE + pdf, binary=True))
            if code.upper() in t.upper():
                text = t
                break
        if text is None:
            errors.append(f"{code}: nie znaleziono listu emisyjnego na stronie serii")
            continue
        got = parse_letter(text)
        check(f"{code} oprocentowanie 1. okresu", s.get("rate1"), got["rate1"])
        if s.get("margin") is None:
            if got["fixed"]:
                oks.append(f"{code} oprocentowanie stałe")
            else:
                errors.append(f"{code}: w rejestrze brak marży (stałe), a list nie mówi o oprocentowaniu stałym")
        else:
            check(f"{code} marża", s.get("margin"), got["margin"])
        check(f"{code} opłata za przedterminowy wykup", s.get("fee"), got["fee"])
        if s.get("swapPrice") is None:
            if got["swapPrice"] is not None:
                errors.append(f"{code}: w rejestrze brak ceny zamiany, a list podaje {fmt(got['swapPrice'])} zł")
        else:
            check(f"{code} cena zamiany", s.get("swapPrice"), got["swapPrice"])

    check_macro(rec, month, first_day, prev, today, cur)
    check_gus(data, rec, month, prev)
    return report(month)


def check_gus(data, rec, month, prev):
    """Wartości CPI z tablicą GUS: rekord miesiąca i całe archiwum."""
    gus, src = gus_cpi()
    if gus is None:
        return
    last = max(gus)
    g = gus.get(prev)
    kind = rec.get("cpiKind")
    if rec.get("cpi") is not None and rec.get("cpiRefMonth") == prev:
        if g is None:
            msg = f"tablica GUS ({src}) kończy się na {last} — brak {prev}, CPI z rekordu nieporównane"
            (warns if kind == "finalny" else oks).append(msg if kind == "finalny" else msg + " (szybki szacunek — tablica ma go dopiero po odczycie finalnym)")
        elif kind == "finalny":
            for key, gk, name in (("cpi", "yoy", "CPI r/r"), ("cpiYtd", "ytd", "cpiYtd")):
                d = gus_diff(f"{name} za {prev}", rec.get(key), g.get(gk))
                if d:
                    errors.append(d + f" (tablica {src})")
                elif rec.get(key) is not None and g.get(gk) is not None:
                    oks.append(f"{name} za {prev} zgodne z GUS: {fmt(g[gk])}%")
        else:
            same = gus_diff("x", rec.get("cpi"), g.get("yoy")) is None
            warns.append(f"GUS ma już odczyt finalny za {prev}: CPI r/r {fmt(g.get('yoy'))}%, od grudnia {fmt(g.get('ytd'))}% "
                       f"({'jak szybki szacunek' if same else 'inny niż szybki szacunek ' + fmt(rec.get('cpi')) + '%'}) — "
                       "zamień w rekordzie „szybki szacunek” na „finalny”")
    check_gus_archive(data, gus, month)


def check_macro(rec, month, first_day, prev, today, cur):
    # NBP
    nbp = nbp_ref_on(first_day)
    if nbp is None:
        errors.append("nie udało się odczytać stopy referencyjnej z archiwum NBP")
    else:
        check(f"stopa referencyjna NBP na {first_day.isoformat()} (obowiązuje od {nbp[0]})", rec.get("nbpRef"), nbp[1])
        if month >= ROR_FROM:
            check_nbp_ror(json.loads((ROOT / "data" / "months.json").read_text(encoding="utf-8")), month)

    # CPI
    if rec.get("cpi") is None:
        errors.append("brak CPI w rekordzie")
    elif rec.get("cpiRefMonth") != prev:
        errors.append(f"CPI dotyczy {rec.get('cpiRefMonth')}, a powinno {prev}")
    else:
        kind = rec.get("cpiKind") or "bez rodzaju"
        need_final = month < cur or (month == cur and today.day >= 18)
        if need_final and kind != "finalny":
            errors.append(f"CPI za {prev} w rekordzie {month} to nadal „{kind}” — GUS publikuje odczyt finalny ok. 15. dnia, "
                          "powinien już zastąpić szybki szacunek")
        else:
            oks.append(f"CPI {fmt(rec['cpi'])}% za {prev} ({kind})" + ("" if need_final else "; odczyt finalny wymagany od 18. dnia"))
        # cpiYtd (GUS „grudzień poprzedniego roku = 100” − 100) — do dokładnej inflacji skumulowanej; wymagany przy odczycie finalnym
        if rec.get("cpiYtd") is None:
            if kind == "finalny":
                errors.append(f"brak cpiYtd za {prev} (GUS „grudzień poprzedniego roku = 100”, ta sama tablica co CPI r/r)")
        else:
            oks.append(f"zmiana cen od grudnia (cpiYtd) {fmt(rec['cpiYtd'])}% za {prev}")


def report(month):
    lines = [f"## Kontrola rejestru: {month}", ""]
    if errors:
        lines += [f"**Rozbieżności: {len(errors)}**", ""] + [f"- ❌ {e}" for e in errors] + [""]
    else:
        lines += ["**Wszystko zgodne ze źródłami.**", ""]
    lines += [f"- ⚠️ {w}" for w in warns]
    lines += [f"- ✅ {o}" for o in oks]
    out = "\n".join(lines)
    print(out)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write(out + "\n")
    return 1 if errors else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # błąd sieci lub nieoczekiwany format
        errors.append(f"kontrola przerwana: {type(e).__name__}: {e}")
        sys.exit(report(sys.argv[1] if len(sys.argv) > 1 else "?"))
