# YssPack

Panel modułowych dodatków do Margonem. Loader Tampermonkey pobiera właściwy panel, styl oraz moduły z GitHub Pages.

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
