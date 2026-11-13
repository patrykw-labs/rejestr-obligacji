#!/usr/bin/env python3
"""Kanał Atom z ofertami obligacji (feed.xml) generowany z data/months.json.

Uruchom po każdej zmianie danych:  python3 scripts/feed.py
Sprawdzenie bez zapisu (CI, validate.py): python3 scripts/feed.py --check

Treść jest deterministyczna (bez znacznika czasu generowania), więc plik zmienia się tylko razem z danymi.
"""
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "months.json"
FEED = ROOT / "feed.xml"
SITE = "https://patrykw-labs.github.io/rejestr-obligacji/"
TAG = "tag:patrykw-labs.github.io,2026:rejestr-obligacji"
N = 36  # ostatnie miesiące w kanale
ORDER = ["OTS", "ROR", "DOR", "TOS", "COI", "EDO", "ROS", "ROD", "DOS", "TOZ"]
TITLE_TYPES = ["EDO", "COI", "TOS", "ROR"]
MONTHS = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień",
          "październik", "listopad", "grudzień"]


def mlabel(ym):
    y, m = ym.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def mshort(ym):
    y, m = ym.split("-")
    return f"{m}.{y}"


def num(v, d=2):
    return "–" if v is None else f"{v:.{d}f}".replace(".", ",")


def rule(s):
    r, m = s.get("rule") or "", num(s.get("margin"))
    if r == "stałe":
        return "stałe"
    if r == "NBP+marża":
        return f"stopa ref. NBP + {m} p.p."
    if r == "CPI+marża":
        return f"inflacja + {m} p.p."
    return r or "–"


def money(v):
    return f"{num(v)} zł" if isinstance(v, (int, float)) else (v or "–")


def entry(ym, rec, prev):
    ser = rec.get("series") or {}
    keys = [k for k in ORDER if k in ser] + sorted(k for k in ser if k not in ORDER)
    head = [f"{k} {num(ser[k].get('rate1'))}%" for k in TITLE_TYPES if k in ser and ser[k].get("rate1") is not None]
    title = f"Oferta obligacji na {mlabel(ym)}" + (": " + ", ".join(head) if head else "")
    rows = []
    for k in keys:
        s = ser[k]
        p = ((prev or {}).get("series") or {}).get(k) or {}
        d = ""
        if s.get("rate1") is not None and p.get("rate1") is not None:
            dv = round(s["rate1"] - p["rate1"], 2)
            d = "0,00" if dv == 0 else ("+" if dv > 0 else "−") + num(abs(dv))
        avail = "" if s.get("availability") in (None, "wszyscy") else f" ({s['availability']})"
        rows.append(f"<tr><td><b>{escape(s.get('code') or k)}</b>{escape(avail)}</td><td>{escape(s.get('term') or '–')}</td>"
                    f"<td>{num(s.get('rate1'))}%</td><td>{d}</td><td>{escape(rule(s))}</td><td>{escape(money(s.get('fee')))}</td></tr>")
    parts = []
    if rec.get("changeNote"):
        parts.append(f"<p>{escape(rec['changeNote'])}</p>")
    parts.append("<table><thead><tr><th>Seria</th><th>Okres</th><th>1. okres</th><th>Δ m/m</th><th>Kolejne okresy</th>"
                 "<th>Opłata</th></tr></thead><tbody>" + "".join(rows) + "</tbody></table>")
    macro = []
    if rec.get("cpi") is not None:
        macro.append(f"inflacja CPI r/r za {mshort(rec.get('cpiRefMonth') or ym)}: {num(rec['cpi'], 1)}%"
                     + (f" ({rec['cpiKind']})" if rec.get("cpiKind") else ""))
    if rec.get("nbpRef") is not None:
        macro.append(f"stopa referencyjna NBP: {num(rec['nbpRef'])}%")
    if macro:
        parts.append("<p>" + escape(" · ".join(macro)) + "</p>")
    parts.append(f"<p>Status rekordu: {escape(rec.get('status') or '–')}. Wiążące są listy emisyjne.</p>")
    link = f"{SITE}#oferta&amp;m={ym}"
    parts.append(f'<p><a href="{link}">Oferta na stronie</a> · <a href="{SITE}#kupno">Co kupić?</a></p>')
    updated = f"{rec.get('updatedAt') or ym + '-01'}T00:00:00Z"
    return updated, (
        "  <entry>\n"
        f"    <title>{escape(title)}</title>\n"
        f"    <id>{TAG}:oferta:{ym}</id>\n"
        f'    <link rel="alternate" type="text/html" href="{link}"/>\n'
        f"    <published>{ym}-01T00:00:00Z</published>\n"
        f"    <updated>{updated}</updated>\n"
        f'    <content type="html">{escape("".join(parts))}</content>\n'
        "  </entry>\n")


def build():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    ids = sorted(data)
    out, last = [], "2019-01-01T00:00:00Z"
    for ym in reversed(ids[-N:]):
        i = ids.index(ym)
        upd, xml = entry(ym, data[ym], data[ids[i - 1]] if i else None)
        last = max(last, upd)
        out.append(xml)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="pl">\n'
        "  <title>Rejestr ofert obligacji — nowe oferty</title>\n"
        "  <subtitle>Miesięczne oferty detalicznych obligacji skarbowych: oprocentowanie, marże, opłaty, inflacja i stopa NBP.</subtitle>\n"
        f"  <id>{TAG}:oferty</id>\n"
        f'  <link rel="self" type="application/atom+xml" href="{SITE}feed.xml"/>\n'
        f'  <link rel="alternate" type="text/html" href="{SITE}"/>\n'
        f"  <updated>{last}</updated>\n"
        "  <author><name>patrykw-labs</name></author>\n"
        + "".join(out) + "</feed>\n")


def main():
    xml = build()
    ET.fromstring(xml.encode("utf-8"))  # poprawny XML
    cur = FEED.read_text(encoding="utf-8") if FEED.exists() else None
    if "--check" in sys.argv:
        if cur != xml:
            print("feed.xml nieaktualny — uruchom: python3 scripts/feed.py")
            sys.exit(1)
        print("feed.xml aktualny")
        return
    if cur != xml:
        FEED.write_text(xml, encoding="utf-8")
        print("feed.xml: zapisano")
    else:
        print("feed.xml: bez zmian")


if __name__ == "__main__":
    main()
