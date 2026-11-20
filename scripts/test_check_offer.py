#!/usr/bin/env python3
"""Test porównania CPI z tablicą GUS w check_offer.py — bez sieci.

Buduje syntetyczną tablicę GUS (CSV w cp1250, jak na stat.gov.pl) z danych archiwum,
po czym sprawdza: zgodność, wykrycie rozbieżności w rekordzie i w archiwum,
brak miesiąca w tablicy i niedostępność tablicy (ostrzeżenie zamiast błędu);
na koniec stopę NBP z 10. dnia roboczego przed miesiącem (ROR/DOR) na syntetycznym archiwum NBP.
Użycie: python3 scripts/test_check_offer.py
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import check_offer as co  # noqa: E402

data = json.loads((ROOT / "data" / "months.json").read_text(encoding="utf-8"))
pre = json.loads((ROOT / "data" / "przed-2019.json").read_text(encoding="utf-8"))["cpi"]
fails = 0


def gus_table(skip=None, patch=None):
    """Wartości {ym: {"yoy", "ytd"}} z archiwum → tekst CSV w układzie GUS."""
    vals = {}
    for ref, v in pre["values"].items():
        vals.setdefault(ref, {})["yoy"] = v
    for ref, v in pre["ytd"].items():
        vals.setdefault(ref, {})["ytd"] = v
    for rec in data.values():
        ref = rec.get("cpiRefMonth")
        if ref and rec.get("cpiKind") == "finalny":
            vals.setdefault(ref, {})["yoy"] = rec["cpi"]
            if rec.get("cpiYtd") is not None:
                vals[ref]["ytd"] = rec["cpiYtd"]
    for ym, d in (patch or {}).items():
        vals.setdefault(ym, {}).update(d)
    lines = ["Nazwa zmiennej;Jednostka terytorialna;Sposób prezentacji;Rok;Miesiąc;Wartość;Flaga;;"]
    names = {"yoy": "Analogiczny miesiąc poprzedniego roku = 100", "ytd": "Grudzień poprzedniego roku = 100"}
    for ym in sorted(vals):
        if ym == skip:
            continue
        y, m = ym.split("-")
        for k, name in names.items():
            if vals[ym].get(k) is not None:
                v = f"{100 + vals[ym][k]:.1f}".replace(".", ",")
                lines.append(f"Wskaźnik cen towarów i usług konsumpcyjnych;Polska;{name};{y};{int(m)};{v};;;")
        lines.append(f"Wskaźnik cen towarów i usług konsumpcyjnych;Polska;Poprzedni miesiąc = 100;{y};{int(m)};100,0;;;")
    return "\n".join(lines) + "\n"


def run(name, csv, month, expect_errors, expect_warns, contains=None):
    global fails
    co.errors.clear(), co.warns.clear(), co.oks.clear()
    with tempfile.TemporaryDirectory() as d:
        if csv is None:
            os.environ["CHECK_GUS_CSV"] = os.path.join(d, "brak.csv")
        else:
            path = os.path.join(d, "t.csv")
            Path(path).write_bytes(csv.encode("cp1250"))
            os.environ["CHECK_GUS_CSV"] = path
        rec = data[month]
        co.check_gus(data, rec, month, rec["cpiRefMonth"])
    text = " | ".join(co.errors + co.warns + co.oks)
    ok = len(co.errors) == expect_errors and len(co.warns) == expect_warns and (contains is None or contains in text)
    print(("OK   " if ok else "BŁĄD ") + name + ("" if ok else f" — błędy {co.errors}, ostrzeżenia {co.warns}"))
    fails += not ok


final = max(ym for ym, r in data.items() if r.get("cpiKind") == "finalny")
ref = data[final]["cpiRefMonth"]
run("zgodna tablica", gus_table(), final, 0, 0, "zgodne z GUS")
run("rozbieżność CPI r/r w rekordzie", gus_table(patch={ref: {"yoy": data[final]["cpi"] + 0.2}}), final, 1, 0, f"CPI r/r za {ref}")
run("rozbieżność cpiYtd w archiwum", gus_table(patch={"2019-03": {"ytd": 9.9}}), final, 1, 0, "cpiYtd za 2019-03")
run("rozbieżność w przed-2019.json", gus_table(patch={"2016-05": {"yoy": 5.0}}), final, 1, 0, "przed-2019.json")
run("odczyt finalny, ale brak miesiąca w tablicy", gus_table(skip=ref), final, 0, 1, "brak " + ref)
run("tablica niedostępna", None, final, 0, 1, "niedostępna")

flash = [ym for ym, r in data.items() if r.get("cpiKind") == "szybki szacunek"]
if flash:
    m = flash[-1]
    run("szybki szacunek, tablica jeszcze bez miesiąca", gus_table(skip=data[m]["cpiRefMonth"]), m, 0, 0, "szybki szacunek")
    run("szybki szacunek, a GUS ma już odczyt finalny",
        gus_table(patch={data[m]["cpiRefMonth"]: {"yoy": data[m]["cpi"], "ytd": data[m].get("cpiYtd")}}), m, 0, 1, "odczyt finalny")

# stopa NBP z 10. dnia roboczego przed miesiącem (list ROR/DOR) a nbpRef z 1. dnia — syntetyczne archiwum NBP
import datetime as dt  # noqa: E402


def nbp_xml(shift=None):
    """Archiwum NBP: stopa z nbpRef miesiąca obowiązuje od ok. 6. dnia poprzedniego miesiąca (jak decyzje RPP — przed 10. dniem
    roboczym przed miesiącem); shift = miesiąc, w którym zmiana wchodzi 3 dni przed jego początkiem i o 1 p.p. wyżej."""
    out = ["<stopy_procentowe_archiwum>"]
    for ym in sorted(data):
        first, rate = dt.date.fromisoformat(f"{ym}-01"), data[ym]["nbpRef"]
        day = (first - dt.timedelta(days=25)).isoformat()
        if ym == shift:
            day, rate = (first - dt.timedelta(days=3)).isoformat(), rate + 1
        val = f"{rate:.2f}".replace(".", ",")
        out.append(f'<pozycje obowiazuje_od="{day}"><pozycja id="ref" oprocentowanie="{val}"/></pozycje>')
    return "\n".join(out + ["</stopy_procentowe_archiwum>"])


def run_nbp(name, xml, month, expect_errors, expect_warns, contains=None):
    global fails
    co.errors.clear(), co.warns.clear(), co.oks.clear(), co._NBP.clear()
    with tempfile.TemporaryDirectory() as d:
        path = os.path.join(d, "nbp.xml")
        Path(path).write_text(xml, encoding="utf-8")
        os.environ["CHECK_NBP_XML"] = path
        co.check_nbp_ror(data, month)
    text = " | ".join(co.errors + co.warns + co.oks)
    ok = len(co.errors) == expect_errors and len(co.warns) == expect_warns and (contains is None or contains in text)
    print(("OK   " if ok else "BŁĄD ") + name + ("" if ok else f" — błędy {co.errors}, ostrzeżenia {co.warns}"))
    fails += not ok


def check(name, got, want):
    global fails
    print(("OK   " if got == want else "BŁĄD ") + name + ("" if got == want else f" — {got!r}, oczekiwano {want!r}"))
    fails += got != want


check("10. dzień roboczy przed 01.12.2026", co.business_days_before(dt.date(2026, 12, 1)), dt.date(2026, 11, 17))
check("10. dzień roboczy przed 01.01.2025 (święta, Wigilia jeszcze roboczy)", co.business_days_before(dt.date(2025, 1, 1)), dt.date(2024, 12, 16))
check("10. dzień roboczy przed 01.01.2026 (Wigilia wolna od 2025)", co.business_days_before(dt.date(2026, 1, 1)), dt.date(2025, 12, 15))
check("10. dzień roboczy przed 01.06.2020 (zmiana stopy NBP 29.05.2020 po tym dniu)", co.business_days_before(dt.date(2020, 6, 1)), dt.date(2020, 5, 18))
check("Wielkanoc 2026", co.easter(2026), dt.date(2026, 4, 5))
last = max(data)
run_nbp("NBP: zmiany przed 10. dniem roboczym — zgodne", nbp_xml(), last, 0, 0, "= nbpRef")
run_nbp("NBP: zmiana w ostatnich dniach roboczych przed kontrolowanym miesiącem — błąd", nbp_xml(shift=last), last, 1, 0, f"ROR/DOR {last}")
run_nbp("NBP: taka zmiana w archiwum — ostrzeżenie", nbp_xml(shift="2023-10"), last, 0, 1, "ROR/DOR 2023-10")
run_nbp("NBP: miesiące przed ROR/DOR (2020) pomijane", nbp_xml(shift="2020-06"), last, 0, 0)

print(f"{'0 błędów' if not fails else f'{fails} błędów'}")
sys.exit(1 if fails else 0)
