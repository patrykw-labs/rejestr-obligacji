# rejestr-obligacji

<a href="https://www.buymeacoffee.com/patrykw"><img src="assets/banner.jpg" alt="Rejestr ofert obligacji — postaw mi kawę" width="100%" /></a>

<a href="https://www.buymeacoffee.com/patrykw"><img src="https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&amp;emoji=&amp;slug=patrykw&amp;button_colour=FFDD00&amp;font_colour=000000&amp;font_family=Cookie&amp;outline_colour=000000&amp;coffee_colour=ffffff" alt="Buy me a coffee" /></a>

[![Walidacja danych](https://github.com/patrykw-labs/rejestr-obligacji/actions/workflows/validate.yml/badge.svg)](https://github.com/patrykw-labs/rejestr-obligacji/actions/workflows/validate.yml) [![Wydanie](https://img.shields.io/github/v/release/patrykw-labs/rejestr-obligacji?label=wydanie)](https://github.com/patrykw-labs/rejestr-obligacji/releases) [![Licencja MIT](https://img.shields.io/badge/licencja-MIT-blue)](LICENSE)

Archiwum miesięcznych ofert detalicznych obligacji skarbowych od stycznia 2019 r. Dla każdego miesiąca i każdej serii (OTS, ROR, DOR, TOS, COI, EDO, ROS, ROD oraz historycznie DOS i TOZ) zapisane są: oprocentowanie w 1. okresie, marża, zasada oprocentowania, opłata za przedterminowy wykup, cena zamiany i link do listu emisyjnego. Wszystko na tle inflacji (CPI r/r, GUS) i stopy referencyjnej NBP.

**Strona:** https://patrykw-labs.github.io/rejestr-obligacji/

Na stronie jest pięć widoków:

- **Oferta miesiąca**: wszystkie serie z wybranego miesiąca, zmiany względem poprzedniego miesiąca, CPI i stopa NBP.
- **Wykres w czasie**: oprocentowanie 1. okresu, marże albo orientacyjne oprocentowanie kolejnych okresów dla wybranych serii na tle CPI i NBP.
- **Historia serii**: jedna seria miesiąc po miesiącu, z różnicą m/m i realnym oprocentowaniem (1. okres − CPI).
- **Kalkulator zamiany**: czy opłaca się zerwać posiadane obligacje (EDO, COI, TOS, ROS, ROD, DOR, ROR, OTS) i kupić nowe z bieżącej oferty. Wybierasz swoją serię z archiwum (parametry z listu emisyjnego uzupełniają się same, a oprocentowanie do dziś liczone jest z prawdziwych odczytów CPI, a dla ROR i DOR — ze stóp NBP), liczbę sztuk, dzień zakupu, miesiąc i dzień zerwania (także w przeszłości — np. żeby sprawdzić decyzję sprzed lat, z rzeczywistą inflacją albo „stanem wiedzy” z tamtego dnia — lub w przyszłości) (odsetki narosłe od ostatniej rocznicy pokrywają część opłaty), horyzont, scenariusz inflacji (i stopy NBP dla ROR/DOR), oprocentowanie konta i rachunek (zwykły, IKE albo IKZE). Wynik: werdykt, koszt zerwania (opłata i podatek), od kiedy zamiana się opłaca, próg inflacji (a dla ROR/DOR także stopy NBP), przy którym zamiana zaczyna się opłacać, wykres od zakupu (z zaznaczonymi zakupami i wykupami, paskiem różnicy i przybliżeniem prognozy) i tabela rok po roku. Możesz też dodać kilka serii naraz (portfel, do 8 serii): każda jest liczona osobno, a kalkulator wskazuje, które opłaca się zamienić, i sumuje wynik (reszty poniżej 100 zł z zerwanych serii łączy przy zakupie). Obsługuje też obligacje kupione przed 2019 r., które nie zostały jeszcze wykupione (EDO od 12.2016, ROD od 10.2016): parametry z listów emisyjnych i inflacja z GUS są w `data/przed-2019.json`, a kopie listów niedostępnych na obligacjeskarbowe.pl w `data/listy/`. Wyliczenie można udostępnić linkiem.
- **Co kupić?**: wpisujesz kwotę, okres i założenia (inflacja, stopa NBP, konto, rachunek zwykły / IKE / IKZE), a strona porównuje wszystkie serie z bieżącej oferty: ile każda da na rękę na koniec okresu (po opłacie za wcześniejszy wykup i podatku), nominalnie i realnie, z rankingiem, wykresem i progiem inflacji, przy którym zmienia się zwycięzca. ROS i ROD pokazuje na życzenie (tylko dla beneficjentów 800+).

> Projekt jest nieoficjalny. Nie jest powiązany z Ministerstwem Finansów, PKO BP ani serwisem obligacjeskarbowe.pl i nie jest rekomendacją inwestycyjną. Dane pochodzą z publicznych źródeł: listów emisyjnych, [obligacjeskarbowe.pl](https://www.obligacjeskarbowe.pl), komunikatów MF, [GUS](https://stat.gov.pl) i [NBP](https://nbp.pl). Wiążące są listy emisyjne.

## Struktura

- `index.html`: szkielet strony; `css/style.css`: style; `js/app.js`, `js/kalkulator.js`, `js/start.js`: kod widoków (czysty HTML, CSS i JS, bez kroku budowania). `scripts/assets.py --fix` wpisuje do adresów plików skróty ich treści, żeby przeglądarka zawsze pobrała aktualną wersję.
- `data/months.json`: wszystkie dane, jeden rekord na miesiąc oferty (`"RRRR-MM"`). Schemat jest opisany w [`.claude/CLAUDE.md`](.claude/CLAUDE.md).
- `data/przed-2019.json`: serie sprzed 2019 r. i inflacja z GUS za 2015–2018, tylko dla kalkulatora zamiany
- `scripts/validate.py`: walidacja schematu i statusów weryfikacji
- `js/zamiana.js`: silnik kalkulatora zamiany; `scripts/test_zamiana.js`: jego testy (m.in. zgodność z niezależnym arkuszem kontrolnym i z zasadami z listów emisyjnych); `scripts/test_strona.js`: test strony w przeglądarce (wszystkie zakładki i linki kalkulatora, komputer i telefon). Wszystko uruchamiane w GitHub Actions
- `.github/workflows/validate.yml`: uruchamia walidację po każdej zmianie danych
- `scripts/check_offer.py` i `.github/workflows/check-offer.yml`: 5. dnia miesiąca porównuje rekord bieżącego miesiąca z ofertą, listami emisyjnymi i stopą NBP, a 20. dnia sprawdza też, czy szybki szacunek CPI zastąpiono odczytem finalnym GUS; przy rozbieżności przebieg kończy się błędem
- `assets/`: grafiki (baner)
- `CHANGELOG.md`: historia zmian (sekcje są też notatkami do wydań na GitHubie)
- `.claude/CLAUDE.md`: instrukcje dla Claude Code, w tym procedura dopisywania miesiąca

## Aktualizacja co miesiąc

Dane aktualizują się automatycznie:

- **4. dnia miesiąca** zadanie w chmurze (Claude Code) dopisuje rekord nowej oferty: każdą serię sprawdza w liście emisyjnym, dodaje stopę referencyjną NBP z 1. dnia miesiąca i szybki szacunek CPI z GUS, a w poprzednim rekordzie zamienia szybki szacunek na odczyt finalny. Po walidacji (`scripts/validate.py`) robi commit `oferta RRRR-MM`.
- **17. dnia miesiąca** to samo zadanie zamienia szybki szacunek CPI w bieżącym rekordzie na odczyt finalny GUS (commit `CPI RRRR-MM finalny`).
- **5. i 20. dnia miesiąca** GitHub Actions (`scripts/check_offer.py`) porównuje rekord bieżącego miesiąca z ofertą, listami emisyjnymi i archiwum stóp NBP, a od 18. dnia sprawdza, czy CPI jest już finalne. Przy rozbieżności przebieg kończy się błędem.

Ręcznie (np. gdy zadanie się nie powiodło): w folderze repozytorium napisz Claude Code „dopisz nowy miesiąc” albo „podmień CPI na finalny”. Procedury są opisane w [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

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
