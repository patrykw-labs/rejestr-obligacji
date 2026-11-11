#!/usr/bin/env python3
"""Kontrola rekordu miesiąca w data/months.json z oficjalnymi źródłami.

Niczego nie zapisuje. Sprawdza:
  - czy istnieje rekord bieżącego miesiąca (lub podanego jako argument RRRR-MM),
  - czy kody serii zgadzają się z ofertą na obligacjeskarbowe.pl,
  - oprocentowanie 1. okresu, marżę, opłatę za przedterminowy wykup i cenę zamiany
    każdej serii z listem emisyjnym (PDF, odczyt przez pdftotext),
  - stopę referencyjną NBP obowiązującą 1. dnia miesiąca (archiwum XML NBP),
  - czy CPI w rekordzie dotyczy poprzedniego miesiąca.

Kod wyjścia 1, gdy coś się nie zgadza albo nie da się tego odczytać.
Użycie: python3 scripts/check_offer.py [RRRR-MM]
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://www.obligacjeskarbowe.pl"
NBP_XML = "https://static.nbp.pl/dane/stopy/stopy_procentowe_archiwum.xml"
UA = "rejestr-obligacji-check/1.0 (+https://github.com/patrykw-labs/rejestr-obligacji)"

errors, oks = [], []


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


def nbp_ref_on(day):
    root = ET.fromstring(fetch(NBP_XML, binary=True))
    best = None
    for poz in root.iter("pozycje"):
        since = poz.get("obowiazuje_od")
        if not since or since > day.isoformat():
            continue
        for p in poz.iter("pozycja"):
            if p.get("id") == "ref":
                if best is None or since > best[0]:
                    best = (since, num(p.get("oprocentowanie")))
    return best


def main():
    tz = ZoneInfo("Europe/Warsaw")
    month = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else dt.datetime.now(tz).strftime("%Y-%m")
    y, m = map(int, month.split("-"))
    first_day = dt.date(y, m, 1)
    prev = (first_day - dt.timedelta(days=1)).strftime("%Y-%m")

    data = json.loads((ROOT / "data" / "months.json").read_text(encoding="utf-8"))
    rec = data.get(month)
    print(f"Kontrola rekordu {month}")
    if rec is None:
        errors.append(f"brak rekordu {month} w data/months.json (miesięczna aktualizacja się nie odbyła?)")
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

    # NBP
    nbp = nbp_ref_on(first_day)
    if nbp is None:
        errors.append("nie udało się odczytać stopy referencyjnej z archiwum NBP")
    else:
        check(f"stopa referencyjna NBP na {first_day.isoformat()} (obowiązuje od {nbp[0]})", rec.get("nbpRef"), nbp[1])

    # CPI
    if rec.get("cpi") is None:
        errors.append("brak CPI w rekordzie")
    elif rec.get("cpiRefMonth") != prev:
        errors.append(f"CPI dotyczy {rec.get('cpiRefMonth')}, a powinno {prev}")
    else:
        oks.append(f"CPI {fmt(rec['cpi'])}% za {prev} ({rec.get('cpiKind') or 'bez rodzaju'})")

    return report(month)


def report(month):
    lines = [f"## Kontrola rejestru: {month}", ""]
    if errors:
        lines += [f"**Rozbieżności: {len(errors)}**", ""] + [f"- ❌ {e}" for e in errors] + [""]
    else:
        lines += ["**Wszystko zgodne ze źródłami.**", ""]
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
