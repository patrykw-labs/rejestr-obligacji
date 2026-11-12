# rejestr-obligacji

<a href="https://www.buymeacoffee.com/patrykw"><img src="assets/banner.jpg" alt="Rejestr ofert obligacji — postaw mi kawę" width="100%" /></a>

<a href="https://www.buymeacoffee.com/patrykw"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=patrykw&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee" /></a>

[![Walidacja danych](https://github.com/patrykw-labs/rejestr-obligacji/actions/workflows/validate.yml/badge.svg)](https://github.com/patrykw-labs/rejestr-obligacji/actions/workflows/validate.yml)

Archiwum miesięcznych ofert detalicznych obligacji skarbowych od stycznia 2019 r. Dla każdego miesiąca i każdej serii (OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD oraz historycznie DOS i TOZ) zapisane są: oprocentowanie w 1. okresie, marża, zasada oprocentowania, opłata za przedterminowy wykup, cena zamiany i link do listu emisyjnego. Wszystko na tle inflacji (CPI r/r, GUS) i stopy referencyjnej NBP.

**Strona:** https://patrykw-labs.github.io/rejestr-obligacji/

Na stronie są cztery widoki:

- **Oferta miesiąca**: wszystkie serie z wybranego miesiąca, zmiany względem poprzedniego miesiąca, CPI i stopa NBP.
- **Wykres w czasie**: oprocentowanie 1. okresu, marże albo orientacyjne oprocentowanie kolejnych okresów dla wybranych serii na tle CPI i NBP.
- **Historia serii**: jedna seria miesiąc po miesiącu, z różnicą m/m i realnym oprocentowaniem (1. okres − CPI).
- **Kalkulator zamiany**: czy opłaca się zerwać posiadane obligacje (EDO, COI, TOS, ROS, ROD, DOR, ROR) i kupić nowe z bieżącej oferty. Wybierasz swoją serię z archiwum (parametry z listu emisyjnego uzupełniają się same, a oprocentowanie do dziś liczone jest z prawdziwych odczytów CPI, a dla ROR i DOR — ze stóp NBP), liczbę sztuk, horyzont, scenariusz inflacji (i stopy NBP dla ROR/DOR), oprocentowanie konta i rachunek (zwykły, IKE albo IKZE). Wynik: werdykt, koszt zerwania (opłata i podatek), od kiedy zamiana się opłaca, inflacja progowa, wykres i tabela rok po roku. Możesz też dodać kilka serii naraz (portfel, do 8 serii): każda jest liczona osobno, a kalkulator wskazuje, które opłaca się zamienić, i sumuje wynik. Wyliczenie można udostępnić linkiem.

> Projekt jest nieoficjalny. Nie jest powiązany z Ministerstwem Finansów, PKO BP ani serwisem obligacjeskarbowe.pl i nie jest rekomendacją inwestycyjną. Dane pochodzą z publicznych źródeł: listów emisyjnych, [obligacjeskarbowe.pl](https://www.obligacjeskarbowe.pl), komunikatów MF, [GUS](https://stat.gov.pl) i [NBP](https://nbp.pl). Wiążące są listy emisyjne.

## Struktura

- `index.html`: strona (czysty HTML + JS, bez kroku budowania)
- `data/months.json`: wszystkie dane, jeden rekord na miesiąc oferty (`"RRRR-MM"`). Schemat jest opisany w [`CLAUDE.md`](CLAUDE.md).
- `scripts/validate.py`: walidacja schematu i statusów weryfikacji
- `js/zamiana.js`: silnik kalkulatora zamiany; `scripts/test_zamiana.js`: jego testy (m.in. zgodność z niezależnym arkuszem kontrolnym i z zasadami z listów emisyjnych), uruchamiane w GitHub Actions
- `.github/workflows/validate.yml`: uruchamia walidację po każdej zmianie danych
- `scripts/check_offer.py` i `.github/workflows/check-offer.yml`: 5. dnia miesiąca porównuje rekord bieżącego miesiąca z ofertą, listami emisyjnymi i stopą NBP, a 20. dnia sprawdza też, czy szybki szacunek CPI zastąpiono odczytem finalnym GUS; przy rozbieżności przebieg kończy się błędem
- `assets/`: grafiki (baner)
- `CLAUDE.md`: instrukcje dla Claude Code, w tym procedura dopisywania miesiąca

## Aktualizacja co miesiąc

Około 4. dnia miesiąca, gdy na obligacjeskarbowe.pl jest już nowa oferta, a GUS opublikował szybki szacunek CPI, w folderze repozytorium napisz Claude Code: „dopisz nowy miesiąc”. Procedura z `CLAUDE.md`:

1. Dopisz rekord z ofertą wszystkich serii, sprawdzoną w listach emisyjnych.
2. Dopisz stopę referencyjną NBP z 1. dnia miesiąca i CPI za poprzedni miesiąc.
3. W rekordzie poprzedniego miesiąca zamień szybki szacunek CPI na odczyt finalny.
4. Uruchom `python3 scripts/validate.py` i zrób commit `oferta RRRR-MM`.

## Podgląd lokalny

Strona wczytuje JSON przez `fetch`, więc otwórz ją przez serwer, a nie bezpośrednio z dysku:

```
python3 -m http.server
```

i wejdź na http://localhost:8000.

## Publikacja

Strona jest budowana przez GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`. Każdy push na `main` automatycznie odświeża stronę w ciągu 1–2 minut. Plik `.nojekyll` wyłącza przetwarzanie przez Jekyll, więc pliki są serwowane bez zmian.

## Statystyki

Anonimowe statystyki odwiedzin (bez cookies): [rejestr-obligacji.goatcounter.com](https://rejestr-obligacji.goatcounter.com/). Kliknięcia w przyciski Buy Me a Coffee są liczone jako zdarzenia `buymeacoffee`, `buymeacoffee-banner` i `buymeacoffee-footer`.

## Błędy w danych

Jeśli jakaś liczba nie zgadza się z listem emisyjnym, [załóż zgłoszenie](https://github.com/patrykw-labs/rejestr-obligacji/issues). Podaj miesiąc, serię i link do listu.

## Wsparcie

Jeśli rejestr Ci się przydaje: [☕ Postaw mi kawę](https://buymeacoffee.com/patrykw).

## Licencja

Kod: [MIT](LICENSE). Dane w `data/` to fakty z publicznych źródeł (MF, GUS, NBP). Licencja MIT dotyczy kodu, a nie tych źródeł.
