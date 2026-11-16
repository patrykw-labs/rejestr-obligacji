# Historia zmian

Wersje wydań na GitHubie: https://github.com/patrykw-labs/rejestr-obligacji/releases. Każda sekcja `## vX.Y.Z` jest jednocześnie treścią notatek do wydania (workflow „Wydanie”). Comiesięczne aktualizacje danych (`oferta RRRR-MM`, `CPI RRRR-MM finalny`) nie są tu wpisywane.

## Nieopublikowane

- „Mój portfel”: „Wklej z rachunku” — tabela posiadanych obligacji skopiowana ze „Stanu rachunku rejestrowego” (albo z jego eksportu do arkusza): kod serii, liczba sztuk (dostępne + zablokowane) i dzień zakupu z daty wykupu; podgląd przed wczytaniem, pominięte wiersze z powodem, wczytanie można cofnąć; tekst zostaje w przeglądarce. „Wczytaj z pliku” przyjmuje też taką tabelę zapisaną jako tekst, CSV lub HTML.
- „Mój portfel”: na liście są też serie kupione w bieżącym miesiącu (zakup po dniu wyceny — komunikat); szersze pole liczby sztuk (mieści 4 cyfry).
## v1.5.0 — 2026-11-16

Portfel w pliku i w kalendarzu, zakup za pieniądze z wykupu, faktyczne oprocentowanie 2. roku na wykresie, wersja strony w pasku i kontrola CPI z tablicą GUS.

- Kontrola rejestru (`check_offer.py`, 5. i 20. dnia): wartości CPI r/r i zmiany cen od grudnia porównywane z tablicą GUS — w rekordzie miesiąca przy odczycie finalnym i w całym archiwum od 2015 r. (rozbieżność > 0,05 p.p. = błąd); przy szybkim szacunku ostrzeżenie, gdy GUS ma już odczyt finalny; niedostępność GUS nie blokuje pozostałych kontroli. Test bez sieci w CI.
- Wykres w czasie: miara „Faktyczne oprocentowanie 2. roku” — ile naprawdę płaciła seria z danego miesiąca w 2. roku (inflacja za miesiąc oferty + 10 + marża; TOS i DOS — stała stopa; DOR — średnia stopa NBP + marża z 2. roku), z rozpisaniem w dymku; zgodna z silnikiem kalkulatora. Zastępuje miarę „Oprocentowanie kolejnych okresów” (CPI z rekordu miesiąca + marża), która nie odpowiadała żadnej faktycznej stopie — CPI z rekordu to odczyt za poprzedni miesiąc, a okres odsetkowy korzysta z CPI sprzed dwóch miesięcy i zaczyna się rok po zakupie.
- „Co kupić?”: opcja „Kupuję za pieniądze z wykupu w terminie” — zakup po cenie zamiany (99,90 zł; OTS 100,00 zł; ROS i ROD bez ceny zamiany — po 100 zł), w adresie `sw=1`; w tabeli i „Jak to policzono” cena zakupu każdej serii.
- „Mój portfel”: zapis portfela do pliku `.json` i „Wczytaj z pliku” — przeniesienie na inne urządzenie albo kopia zapasowa; nierozpoznane serie pomijane z komunikatem, wczytanie można cofnąć.
- „Mój portfel”: kalendarz `.ics` z kuponami COI, odsetkami ROR/DOR, zmianami oprocentowania i wykupami każdej serii do terminu (z przypomnieniem dzień przed wykupem; kwoty prognozowane i wstępne oznaczone jak w widoku) — do zaimportowania w telefonie lub komputerze.
- Wersja strony w pasku górnym (na telefonie w stopce): wydanie z `CHANGELOG.md` oraz liczba commitów na `main` po wydaniu i skrót ostatniego commita (np. „v1.4.0 +3 · a279333”, link do zmian na GitHubie); bez odpowiedzi API GitHuba — samo wydanie.

## v1.4.0 — 2026-11-16

Poprawki obliczeń po zewnętrznym przeglądzie, łatwiejsza obsługa strony i czcionka z własnego serwera.

**Obliczenia**
- Gdy okres porównania kończy się dokładnie w dniu wykupu, kwota trafia na konto zamiast w nowe obligacje po 99,90 zł wycenione od razu po 100 zł. Usuwa to sztuczny zysk ok. 0,08 zł na sztuce, który faworyzował serię z terminem na koniec okresu (w „Co kupić?”) i wariant „trzymam” przy domyślnym horyzoncie kalkulatora zamiany.
- „Mój portfel”: „Przy wykupie w terminie” obejmuje kupony COI i odsetki ROR/DOR należne do wykupu (wcześniej tylko ostatni kupon), z rozbiciem w kafelku, tabeli i CSV. Stopy liczone z szybkiego szacunku CPI są oznaczone jako wstępne. Seria w miesiącu swojego wykupu jest na liście do dnia wykupu.
- „Co kupić?”: notka, gdy przy okresie o miesiąc krótszym lub dłuższym wygrywa inna seria (np. COI bez opłaty przy wypłacie w rocznicę zakupu).
- IKZE: przy wyniku i w opisie wykresu notka, że ulga w PIT przy wpłacie nie jest liczona — nie zmienia porównania, ale linie „wpłata + …”, zysk realny i roczny wypadają przez nią gorzej; z przykładem kosztu wpłaty po uldze 12% i 32%.
- Objaśnienie, dlaczego inflacja skumulowana w styczniu i lutym może się różnić od wskaźnika r/r (coroczna zmiana wag koszyka GUS).

**Obsługa strony**
- Skrót do wyniku: w kalkulatorze zamiany i w „Co kupić?” przyklejony pasek z werdyktem, dopóki wynik jest poniżej ekranu; kliknięcie przewija do wyniku.
- Link z ustawieniami, których nie da się odtworzyć (nieznana seria, okres spoza listy, kwota poza zakresem), pokazuje komunikat zamiast po cichu przechodzić na ustawienia domyślne.
- Oferta miesiąca: kafelek „Najwyższe oprocentowanie 1. okresu” wybiera serię dostępną dla wszystkich (serie dla 800+ osobną linijką) i odsyła do porównania na rękę w „Co kupić?”.
- Dostępność: zakładki z `aria-controls` i panelem `tabpanel`, przełączanie strzałkami, Home i End.
- Prywatność: czcionka Plus Jakarta Sans z własnego serwera (`assets/fonts`, licencja SIL OFL) zamiast Google Fonts — adres IP odwiedzających nie trafia do zewnętrznych serwerów czcionek.

**Jakość**
- Walidacja: opłata za wykup zapisana tekstem dozwolona tylko dla OTS — opłata innej serii zapisana tekstem byłaby w kalkulatorach liczona jako 0 zł.

## v1.3.0 — 2026-11-14

Dokładniejsza inflacja skumulowana, zapamiętany portfel, ikona RSS i lepsza czytelność w obu motywach.

- Dokładna inflacja skumulowana: „Jak wypadła seria” i linie „wpłata + inflacja” liczą zmianę cen z poziomu cen GUS (łańcuch wskaźników „grudzień poprzedniego roku = 100”, nowe pole `cpiYtd` od 2015 r.) zamiast przybliżenia z CPI r/r. Dla serii kupionych w czasie wysokiej inflacji wynik realny zmienił się o kilka punktów procentowych — np. EDO z 04.2023: inflacja do dziś 12,1% zamiast 18,0%, wynik realny +4,2% zamiast −1,0%.
- „Mój portfel” zapamiętuje się w przeglądarce (tylko na tym urządzeniu) i wczytuje przy następnej wizycie; po każdej zmianie mignięcie „✓ Zapisano”, „Zapomnij portfel” usuwa zapis. Portfel otwarty z linku nie nadpisuje zapamiętanego — można go zapamiętać albo wczytać własny.
- Ikona RSS w górnej belce (obok przełącznika motywu) — link do kanału z nowymi ofertami.
- Czytelność: kontrast tekstu co najmniej 4,5:1 (WCAG AA) w obu motywach — ciemniejszy tekst drugorzędny w jasnym motywie i wybrane przyciski w ciemnym.
- Test strony także w ciemnym motywie: zakładki na komputerze i telefonie, kontrast tekstu, przełącznik motywu i eksport PNG z ciemnym tłem.
- Porządki w kodzie: eksport (CSV, PNG) w `js/eksport.js`, dymki i „Wyczyść ustawienia” w `js/wspolne.js`.

## v1.2.0 — 2026-11-13

Nowe zakładki „Co kupić?” i „Mój portfel”, wynik historyczny każdej serii, eksport wyników i kanał Atom z ofertami.

- Nowa zakładka **„Co kupić?”**: ta sama kwota w każdą serię z bieżącej oferty — ranking według kwoty na rękę na koniec wybranego okresu (3 miesiące – 12 lat), zysk, roczna stopa i wartość realna, wykres w czasie i tabela wszystkich serii, próg inflacji między pierwszym a drugim miejscem; scenariusze inflacji i stopy NBP, rachunek zwykły / IKE / IKZE, ROS i ROD dla beneficjentów 800+.
- Nowa zakładka **„Mój portfel”**: wartość posiadanych obligacji dziś, wypłata na rękę po zerwaniu (opłata i podatek), wartość przy wykupie w terminie, najbliższe 12 miesięcy (kupony, nowe oprocentowanie — znane albo prognoza, wykupy); do 20 serii, link do wyliczenia i przejście do kalkulatora zamiany.
- Historia serii: przełącznik **„Jak wypadła seria”** — wynik obligacji za 100 zł z każdej emisji do wykupu albo do dziś, rocznie, na tle inflacji w tym samym czasie (realnie); po podatku albo w IKE; DOS liczony, TOZ (WIBOR) pominięty.
- Wykresy w kalkulatorze zamiany i w „Co kupić?”: legenda jako przełączniki (kliknięcie ukrywa lub pokazuje linię, oś dopasowuje się do widocznych) i linie odniesienia w złotych: „wpłata + inflacja” (obligacje nad linią zarabiają realnie, pod nią tracą) i „wpłata na stopie NBP” (po podatku).
- Eksport: wykres do PNG (tytuł, legenda widocznych linii, kolory bieżącego motywu, znak wodny z logo i adresem strony) i tabela do CSV (średnik i przecinek dziesiętny — otwiera się w Excelu; z założeniami i linkiem) w kalkulatorze zamiany i w „Co kupić?”; w „Mój portfel” serie i zdarzenia do CSV.
- Kanał Atom (`feed.xml`) z ofertami z ostatnich 36 miesięcy — link „subskrybuj nowe oferty (RSS)” w zakładce Oferta i w stopce; wpis prowadzi do oferty danego miesiąca (`#oferta&m=RRRR-MM`). CI sprawdza, czy kanał odpowiada danym.
- Przycisk „Wyczyść ustawienia” w kalkulatorze zamiany, „Co kupić?” i „Mój portfel” — przywraca stan jak przy pierwszym wejściu; „Cofnij” przywraca poprzednie ustawienia.
- Dymki „?” we wszystkich zakładkach (kolumny tabel w Ofercie i Historii serii, miara na wykresie, „Realnie” — wartość w dzisiejszych złotych); dymki w tabelach i kafelkach nie są już ucinane.
- Na telefonie wszystkie zakładki mieszczą się w pasku, a aktywna jest zawsze widoczna.
- Serie EDO1028, EDO1128 i EDO1228: źródłem są listy emisyjne na obligacjeskarbowe.pl zamiast kopii w repozytorium.

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
