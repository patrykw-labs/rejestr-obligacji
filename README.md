# Rejestr ofert obligacji

Archiwum miesięcznych ofert detalicznych obligacji skarbowych od stycznia 2019: oprocentowanie 1. okresu, marże, opłaty, ceny zamiany i linki do listów emisyjnych na tle CPI (GUS) i stopy referencyjnej NBP.

- Strona: `index.html` (GitHub Pages, gałąź `main`, katalog główny)
- Dane: `data/months.json`
- Walidacja: `python3 scripts/validate.py`
- Instrukcje dla Claude Code: `CLAUDE.md`

Podgląd lokalny: `python3 -m http.server` i otwórz http://localhost:8000 (otwarcie pliku bezpośrednio z dysku nie wczyta danych).
