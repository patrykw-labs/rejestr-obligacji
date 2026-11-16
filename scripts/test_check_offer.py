#!/usr/bin/env python3
"""Test porównania CPI z tablicą GUS w check_offer.py — bez sieci.

Buduje syntetyczną tablicę GUS (CSV w cp1250, jak na stat.gov.pl) z danych archiwum,
po czym sprawdza: zgodność, wykrycie rozbieżności w rekordzie i w archiwum,
brak miesiąca w tablicy i niedostępność tablicy (ostrzeżenie zamiast błędu).
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

print(f"{'0 błędów' if not fails else f'{fails} błędów'}")
sys.exit(1 if fails else 0)
