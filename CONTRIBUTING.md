# Zasady pracy w TuttiTrip

Dotyczą wszystkich repozytoriów organizacji: `tuttitrip`, `tuttitrip-frontend`, `tuttitrip-backend` i `tuttitrip-worker`. Teksty dla ludzi (zgłoszenia, opisy PR) piszemy po polsku. Prefiksy typów w tytułach są po angielsku.

## Zgłoszenia (issues)

Tytuł zaczyna się od typu: `feat:`, `docs:`, `chore:` albo `bug:`. Można dopisać zakres w nawiasie, np. `feat(frontend): Filtrowanie wyjazdów po dacie`. Po dwukropku i spacji musi być opis, co najmniej 4 znaki. Typ i zakres piszemy małymi literami.

Treść składa się z sekcji z nagłówkami `###`. Żadna wymagana sekcja nie może być pusta:

| Typ | Wymagane sekcje |
| --- | --- |
| `feat`, `docs`, `chore` | Opis, Dlaczego, Kryteria akceptacji, Definition of Done, Obszar |
| `bug` | Opis, Kroki do odtworzenia, Oczekiwane zachowanie, Faktyczne zachowanie, Środowisko, Dlaczego, Kryteria akceptacji, Definition of Done, Obszar |

W `feat` jest jeszcze sekcja Poza zakresem, ale można ją pominąć. Kryteria akceptacji piszemy jako listę `- [ ]` albo w formie Given/When/Then, tak żeby dało się je sprawdzić. Obszar to Frontend, Backend, Worker, Infra, Design albo Pitch.

Najprościej założyć zgłoszenie przez formularz: New issue, potem wybór typu. Formularz wpisuje prefiks do tytułu, ustawia etykietę `type:*` i typ zgłoszenia oraz dodaje je do projektu TuttiTrip.

Z terminala:

```bash
gh issue create --title "feat(backend): Eksport planu do PDF" --body-file issue.md
```

Plik `issue.md` ma te same nagłówki co formularz (`### Opis`, `### Dlaczego` i tak dalej). Wielkość liter i polskie znaki w nagłówkach nie mają znaczenia, `##` też przejdzie.

Workflow `Issue format` sprawdza każde nowe, edytowane i ponownie otwarte zgłoszenie. Gdy coś się nie zgadza, bot pisze komentarz z listą błędów i przykładem, dodaje etykietę `invalid-format` i zamyka zgłoszenie jako "not planned". Po poprawieniu tytułu albo treści (Edit) otwiera je z powrotem. Sekcja z samym `_No response_`, `...`, `TODO`, `<placeholderem>` albo pustym `- [ ]` liczy się jako pusta.

## Pull requesty

Tytuł PR ma te same prefiksy co zgłoszenia, z jedną różnicą: poprawka błędu to `bugfix:`, nie `bug:`. Dozwolone są więc `feat:`, `docs:`, `chore:` i `bugfix:`, opcjonalnie z zakresem, np. `bugfix(backend): Plan uwzględnia godziny otwarcia`. Tytuł PR trafia do historii `develop` i do notatek wydania, więc ma mówić, co się zmieniło.

PR wydania z `develop` do `main` ma tytuł `release: opis`, np. `release: Logowanie i podglądy gałęzi`. Prefiks `release:` jest dozwolony tylko w takim PR.

Opis PR wypełniamy po polsku według szablonu, który GitHub wstawia przy tworzeniu PR w przeglądarce:

- `## Co i dlaczego`: co zmienia PR i po co,
- `## Powiązane issue`: `Closes #12` albo `Refs #12`; w `docs` i `chore` może być `brak`,
- `## Lista zmian`,
- `## Jak przetestować`: kroki i link do podglądu,
- `## Zrzuty ekranu`: dla UI desktop i telefon, w innych przypadkach "nie dotyczy",
- `## Checklista`: verify lokalnie, testy, docs / AGENTS.md, brak sekretów.

Workflow `PR format` sprawdza tytuł i to, czy sekcje Co i dlaczego, Lista zmian i Jak przetestować są wypełnione, a w `feat` i `bugfix` także odnośnik `#<numer>` w Powiązanym issue. Błędy wypisuje w jednym komentarzu i oznacza check na czerwono. Po poprawce check robi się zielony, a komentarz zmienia się na "Format OK". PR wydania nie potrzebuje sekcji, bo jego opis to notatki wydania. Na darmowym planie GitHub nie ma ochrony gałęzi, więc czerwony check nie blokuje przycisku Merge. Nie mergujemy PR z czerwonym checkiem.

## Gałęzie i merge

1. Zaczynamy od świeżego `develop` na gałęzi `feature/<krótka-nazwa>`, `fix/<krótka-nazwa>` albo `chore/<krótka-nazwa>`.
2. Otwieramy PR do `develop`. Wchodzi, gdy CI i `PR format` są zielone.
3. PR do `develop` mergujemy przez "Squash and merge". Tytuł PR staje się wtedy jedynym commitem na `develop`.
4. Wydanie to PR z `develop` do `main`, mergowany przez "Create a merge commit", żeby historia `main` zawierała commity z `develop`. `main` to produkcja.
5. Nie pushujemy bezpośrednio do `main` ani `develop` i nie robimy force-push.
6. Po merge'u gałąź roboczą usuwa workflow `Delete merged branch`, a razem z nią znika jej podgląd. `main` i `develop` nie są nigdy usuwane, więc PR wydania idzie prosto z `develop`. Gałąź zostaje, jeśli PR zamknięto bez merge'a albo jeśli jest bazą innego otwartego PR. Ustawienie "Automatically delete head branches" jest wyłączone, bo bez ochrony gałęzi kasowało `develop` po każdym wydaniu.

Repozytoria mają włączone tylko dwie metody: "Squash and merge" (tytuł commita to zawsze tytuł PR) i "Create a merge commit". GitHub pozwala ustawić metody tylko dla całego repozytorium, nie dla gałęzi, więc wybór metody to zasada zespołu. Repozytorium zbiorcze `tuttitrip` ma tylko `main`, więc jego PR idą prosto do `main` przez "Squash and merge". Każda gałąź dostaje własny podgląd frontendu i API. Szczegóły są w `AGENTS.md` każdego repozytorium.

## Wydania i notatki

Notatki wydania powstają same w GitHub Releases (bez pliku CHANGELOG):

- Każdy PR dostaje etykietę `type:*` na podstawie prefiksu tytułu (`bugfix:` daje `type:bug`).
- Po każdym merge'u do `develop` Release Drafter aktualizuje szkic następnego wydania. Zmiany są pogrupowane: 🚀 Nowe funkcje, 🐛 Poprawki, 📚 Dokumentacja, 🧹 Porządki.
- Merge PR wydania z `develop` do `main` publikuje ten szkic i zakłada tag na `main`. Sam PR wydania nie trafia do listy zmian.
- Numer wersji: `feat` podnosi wersję minor, pozostałe typy patch. Pierwsze wydanie to `v0.1.0`.
