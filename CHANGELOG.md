# Historia zmian

Wersje wydań na GitHubie: https://github.com/patrykw-labs/rejestr-obligacji/releases. Każda sekcja `## vX.Y.Z` jest jednocześnie treścią notatek do wydania (workflow „Wydanie”). Comiesięczne aktualizacje danych (`oferta RRRR-MM`, `CPI RRRR-MM finalny`) nie są tu wpisywane.

## Nieopublikowane

- Eksport: w kalkulatorze zamiany i w „Co kupić?” wykres do PNG (z tytułem, legendą widocznych linii, kolorami bieżącego motywu i znakiem wodnym z logo i adresem strony pod liniami wykresu) i tabela do CSV (średnik, przecinek dziesiętny — otwiera się w Excelu; z założeniami i linkiem); w „Mój portfel” serie i zdarzenia do CSV.
- Kanał Atom (`feed.xml`) z ofertami z ostatnich 36 miesięcy — link „subskrybuj nowe oferty (RSS)” w zakładce Oferta i w stopce; wpis prowadzi do oferty danego miesiąca (`#oferta&m=RRRR-MM`).
- Nowa zakładka **„Mój portfel”**: wartość posiadanych obligacji dziś, wypłata na rękę po zerwaniu (opłata i podatek), wartość przy wykupie w terminie, najbliższe 12 miesięcy (kupony, nowe oprocentowanie — znane albo prognoza, wykupy); do 20 serii, link do wyliczenia i przejście do kalkulatora zamiany.
- Historia serii: przełącznik **„Jak wypadła seria”** — wynik obligacji za 100 zł z każdej emisji do wykupu albo do dziś, rocznie, na tle inflacji w tym samym czasie (realnie); po podatku albo w IKE; DOS liczony, TOZ (WIBOR) pominięty.
- Dymki „?” także w zakładkach Oferta (kolumny tabeli), Wykres (miara) i Historia serii; dymki w kafelkach nie są ucinane.
- Na telefonie wszystkie zakładki mieszczą się w pasku, a aktywna jest zawsze widoczna.
- Wykresy w kalkulatorze zamiany i w „Co kupić?”: legenda jako przełączniki (kliknięcie ukrywa lub pokazuje linię, oś dopasowuje się do widocznych), linie odniesienia w złotych: „wpłata + inflacja” (wpłacona kwota od dnia zakupu rośnie o inflację — obligacje nad linią zarabiają realnie, pod nią tracą) i „wpłata na stopie NBP” (po podatku; do dziś z archiwum, dalej scenariusz).
- „Co kupić?”: tabela wszystkich serii pod wykresem.
- Dymek „?” przy kolumnach „Realnie” i „Różnica realnie”: wyjaśnienie wartości w dzisiejszych złotych. Dymki w tabelach nie są już ucinane przez ramkę tabeli.
- Nowa zakładka **„Co kupić?”**: ta sama kwota w każdą serię z bieżącej oferty — ranking według kwoty na rękę na koniec wybranego okresu (3 miesiące – 12 lat), zysk, roczna stopa i wartość realna, wykres w czasie, próg inflacji między pierwszym a drugim miejscem; scenariusze inflacji i stopy NBP, rachunek zwykły / IKE / IKZE, ROS i ROD dla beneficjentów 800+.

## v1.1.0 — 2026-11-13

Porządki w repozytorium i zabezpieczenia strony; obliczenia i dane bez zmian.

- Strona podzielona na pliki: `css/style.css`, `js/app.js`, `js/kalkulator.js`, `js/start.js`; adresy plików z `?v=<skrót treści>` (`scripts/assets.py`), więc przeglądarka nie łączy nowej strony ze starą kopią plików.
- Poprawka: ukryte dymki „?” nie poszerzają już strony kalkulatora na komputerze (zbędny poziomy pasek przewijania).
- Test strony w przeglądarce w GitHub Actions (`scripts/test_strona.js`): wszystkie zakładki i kilkanaście linków kalkulatora, na komputerze i telefonie.
- Dependabot: comiesięczne podbijanie wersji akcji GitHub Actions; Node 22 w workflow.
- Workflow „Wydanie”: notatki z tego pliku, opcja odtworzenia wydania na wskazanym commicie.
- Instrukcje projektu: zasada niezależności od zewnętrznych produktów.

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
