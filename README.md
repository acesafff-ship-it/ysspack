# YssPack

Panel modułowych dodatków do Margonem. Loader Tampermonkey pobiera właściwy panel, styl oraz moduły z GitHub Pages.

## Dostępne moduły

- **Bestiariusz Podręczny 2.2.34** — Elity, Elity II, Herosi, Kolosi i Tytani, przedmioty, dojścia oraz kalkulator łupu.
- **Minuty i sekundy przedmiotu 2.3.1** — dokładny czas aktywnego błogosławieństwa; poprawiona pętla odświeżania interfejsu.
- **Asystent Aukcji 1.2.6** — wyszukiwanie ofert wybranego przedmiotu.
- **Magazyn Postaci 1.4.1** — lokalny podgląd przedmiotów i złota innych własnych postaci.

Każdy moduł można niezależnie włączyć lub wyłączyć w panelu YssPack. Po przeniesieniu dodatku do YssPack wyłącz jego osobny userscript w Tampermonkey, aby nie uruchamiać dwóch kopii.

## Publikacja

1. Utwórz publiczne repozytorium GitHub o nazwie `ysspack`.
2. Wgraj do jego głównego katalogu wszystkie pliki i folder `modules`.
3. W ustawieniach repozytorium otwórz **Pages**.
4. Wybierz publikację z gałęzi `main` oraz katalogu `/root`.
5. Poczekaj, aż adres `https://acesafff-ship-it.github.io/ysspack/pack.js` zacznie zwracać kod.
6. Zainstaluj `YssPack.user.js` w Tampermonkey.

## Dodawanie modułu

Każdy moduł eksportuje obiekt z polami `id`, `name`, `version`, `description`, opcjonalnym `settings` oraz metodą `start(context)`. Metoda `start` może zwrócić funkcję sprzątającą, wywoływaną po wyłączeniu modułu.

Po dodaniu pliku dopisz jego ścieżkę do tablicy `moduleFiles` w `pack.js` i uzupełnij `manifest.json`.

## Ważne

Kod uruchamiany w przeglądarce pozostaje możliwy do podejrzenia. Ta architektura ułatwia publikowanie i aktualizowanie modułów, ale nie służy do ukrywania ich kodu.
