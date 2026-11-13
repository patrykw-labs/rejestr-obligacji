# Historia zmian

Wersje wydań na GitHubie: https://github.com/patrykw-labs/rejestr-obligacji/releases. Każda sekcja `## vX.Y.Z` jest jednocześnie treścią notatek do wydania (workflow „Wydanie”). Comiesięczne aktualizacje danych (`oferta RRRR-MM`, `CPI RRRR-MM finalny`) nie są tu wpisywane.

## Nieopublikowane

## v1.1.0 — 2026-11-13

Porządki w repozytorium i zabezpieczenia strony; obliczenia i dane bez zmian.

- Strona podzielona na pliki: `css/style.css`, `js/app.js`, `js/kalkulator.js`, `js/start.js`; adresy plików z `?v=<skrót treści>` (`scripts/assets.py`), więc przeglądarka nie łączy nowej strony ze starą kopią plików.
- Poprawka: ukryte dymki „?” nie poszerzają już strony kalkulatora na komputerze (zbędny poziomy pasek przewijania).
- Test strony w przeglądarce w GitHub Actions (`scripts/test_strona.js`): wszystkie zakładki i kilkanaście linków kalkulatora, na komputerze i telefonie.
- Dependabot: comiesięczne podbijanie wersji akcji GitHub Actions; Node 22 w workflow.
- Workflow „Wydanie”: notatki z tego pliku, opcja odtworzenia wydania na wskazanym commicie.
- Instrukcje projektu: zasada niezależności od zewnętrznych produktów (bez ich nazw, autorów i brandingu).

## v1.0.0 — 2026-11-13

Pierwsze wydanie **Rejestru ofert obligacji** — archiwum miesięcznych ofert detalicznych obligacji skarbowych z kalkulatorem zamiany.

**Strona:** https://patrykw-labs.github.io/rejestr-obligacji/

### Archiwum ofert (od 01.2019)
- **95 miesięcy** ofert: wszystkie serie (OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD, historycznie DOS i TOZ) — oprocentowanie 1. okresu, marża, zasada oprocentowania, opłata za przedterminowy wykup, cena zamiany, link do listu emisyjnego.
- Każdy rekord sprawdzony w listach emisyjnych; inflacja (CPI r/r) z GUS i stopa referencyjna z NBP.
- Widoki: **Oferta miesiąca**, **Wykres w czasie**, **Historia serii**.
- Automatyczna kontrola w GitHub Actions (5. i 20. dnia miesiąca) i walidacja danych przy każdej zmianie.

### Kalkulator zamiany
Czy opłaca się zerwać posiadane obligacje i kupić nowe, czy trzymać je do wykupu?
- **Wszystkie serie:** EDO, COI, TOS, ROS, ROD, DOR, ROR, OTS — z archiwum (parametry z listów emisyjnych) albo wpisane ręcznie; także EDO i ROD kupione przed 2019 r., które są jeszcze w obiegu.
- **Rzetelne zasady z listów emisyjnych:** indeksacja CPI z miesiąca P−2, ROR/DOR wg stopy NBP, opłaty z limitem narosłych odsetek, kupony COI, podatek Belki, cena zamiany 99,90 zł (OTS 100,00 zł).
- **Portfel kilku serii naraz:** kalkulator wskazuje, które serie zamienić, a reszty poniżej 100 zł łączy przy zakupie.
- **Data i dzień zerwania:** także w przeszłości (sprawdzenie decyzji sprzed lat — z rzeczywistą inflacją albo „stanem wiedzy” z tamtego dnia) i w przyszłości; odsetki narosłe od ostatniej rocznicy.
- **Założenia:** scenariusze inflacji (także rok po roku), stopa NBP, oprocentowanie konta, warunki przyszłych zakupów, rachunek zwykły / IKE / IKZE, wycena „trzymam” albo „wypłata wszystkiego”.
- **Wynik:** werdykt, koszt zerwania, od kiedy zamiana się opłaca, inflacja i stopa NBP progowa, wykres od zakupu (zakupy, wykupy, pasek różnicy, przybliżenie prognozy), tabela rok po roku, „Jak to policzono” i link do wyliczenia.
- Silnik obliczeń pokryty testami (170 sprawdzeń), w tym zgodność z niezależnym arkuszem kontrolnym i ze scenariuszami z publikacji o zamianie EDO.

> Projekt nieoficjalny, nie jest rekomendacją inwestycyjną. Wiążące są listy emisyjne.
