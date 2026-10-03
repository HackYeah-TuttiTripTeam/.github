# Zasady pracy w TuttiTrip

Dotyczą wszystkich repozytoriów organizacji: `tuttitrip`, `tuttitrip-frontend`, `tuttitrip-backend` i `tuttitrip-worker`.

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

## Gałęzie i pull requesty

1. Zaczynamy od świeżego `develop` na gałęzi `feature/<krótka-nazwa>`, `fix/<krótka-nazwa>` albo `chore/<krótka-nazwa>`.
2. Otwieramy PR do `develop`. W opisie warto dodać `Closes #<numer>`, wtedy zgłoszenie zamknie się po merge'u. PR wchodzi, gdy CI jest zielone.
3. Wydanie to PR z `develop` do `main`. `main` to produkcja.
4. Nie pushujemy bezpośrednio do `main` ani `develop` i nie robimy force-push. Na darmowym planie GitHub nie da się tego wymusić ochroną gałęzi, więc to zasada zespołu.

Każda gałąź dostaje własny podgląd frontendu i API. Szczegóły są w `AGENTS.md` każdego repozytorium.
