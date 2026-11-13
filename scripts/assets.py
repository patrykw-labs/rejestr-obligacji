#!/usr/bin/env python3
"""Wersje plików strony w adresach (?v=<skrót treści>), żeby przeglądarka nie łączyła nowego index.html
ze starą kopią stylów lub skryptów z pamięci podręcznej.

  python3 scripts/assets.py         — sprawdza, czy index.html ma aktualne skróty (błąd = kod 1)
  python3 scripts/assets.py --fix   — wpisuje aktualne skróty do index.html

Uruchom --fix po każdej zmianie pliku z listy ASSETS; GitHub Actions sprawdza zgodność.
"""
import hashlib, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ["css/style.css", "js/zamiana.js", "js/app.js", "js/kalkulator.js", "js/start.js"]
INDEX = ROOT / "index.html"

def digest(rel):
    return hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()[:10]

def main():
    fix = "--fix" in sys.argv[1:]
    html = INDEX.read_text(encoding="utf-8")
    errors, out = [], html
    for rel in ASSETS:
        want = digest(rel)
        pat = re.compile(r'((?:href|src)=")' + re.escape(rel) + r'(?:\?v=([^"]*))?(")')
        found = pat.findall(out)
        if len(found) != 1:
            errors.append(f"{rel}: w index.html {len(found)} odwołań (oczekiwano 1)"); continue
        if found[0][1] != want:
            errors.append(f"{rel}: ?v={found[0][1] or '(brak)'}, aktualny skrót {want}")
            out = pat.sub(lambda m: f"{m.group(1)}{rel}?v={want}{m.group(3)}", out)
    if fix:
        if out != html: INDEX.write_text(out, encoding="utf-8")
        print("index.html: skróty aktualne" if out == html else "index.html: zaktualizowano skróty")
        return 0
    for e in errors: print("BŁĄD:", e)
    print(f"{len(ASSETS)} plików, błędów: {len(errors)}" + ("" if not errors else " — uruchom: python3 scripts/assets.py --fix"))
    return 1 if errors else 0

if __name__ == "__main__":
    sys.exit(main())
