# tuttitrip-discord-relay

Worker Cloudflare, który odbiera webhook organizacji HackYeah-TuttiTripTeam i
wysyła na Discord wiadomości o zmianach w projekcie GitHub #1 "TuttiTrip".
GitHub Actions nie ma zdarzeń dla Projects v2, a endpoint `/github` Discorda
nie formatuje zdarzeń `projects_v2_item`, dlatego potrzebny jest ten
przekaźnik.

- Adres: `https://tuttitrip-hooks.gburek.app/github` (Custom Domain;
  workers.dev jest wyłączony, bo na tym koncie stoi za Cloudflare Access).
- Kod: `src/index.js` (podpis, filtrowanie, GraphQL, wysyłka),
  `src/format.js` (treść wiadomości), konfiguracja w `wrangler.jsonc`.

## Co wysyła

- `projects_v2_item` z projektu #1: dodanie do projektu, zmiana pola (Status,
  Area, Priority, Estimate, Iteration: stara i nowa wartość), zamiana szkicu na
  issue, archiwizacja, przywrócenie, usunięcie. Zmiana kolejności, etykiet i
  przypisań nie trafia na kanał. Listę pól zawęża zmienna `PROJECT_FIELDS`.
- `projects_v2`: utworzenie, zamknięcie, ponowne otwarcie, usunięcie projektu.
- `issues` i `pull_request` (gdy `FORWARD_ISSUES_PRS` = `"true"`): nowe,
  zamknięte, ponownie otwarte issue; nowy PR, gotowy do review, scalony,
  zamknięty bez scalenia. Akcje botów (np. `Issue format` zamykający złe
  zgłoszenie) są pomijane. Wyniki workflow wysyła GitHub Actions
  (`discord-notify.yml`), nie ten Worker.

Każde żądanie musi mieć poprawny `X-Hub-Signature-256` (HMAC SHA-256 z
`GITHUB_WEBHOOK_SECRET`), inaczej Worker odpowiada 401. Odpowiedź 200 ma w
treści `{"posted": true, "discord": 204}` albo powód pominięcia, więc w
"Recent Deliveries" webhooka widać, co się stało. Błąd Discorda daje 502.

## Sekrety

| Sekret | Skąd |
| --- | --- |
| `DISCORD_WEBHOOK_URL` | URL webhooka kanału Discord (ten sam co w sekretach repozytoriów) |
| `GITHUB_WEBHOOK_SECRET` | losowy sekret, ten sam w ustawieniach webhooka organizacji |

Worker nie używa tokenu GitHub. Zdarzenie elementu projektu nie zawiera
tytułu, więc wiadomość podaje typ (Issue, Pull request, Szkic), kto zmienił,
starą i nową wartość pola oraz link do elementu w projekcie. Nowe issue trafiają
do projektu przez formularze zgłoszeń (`projects:`) i wbudowany auto-add, nie
przez ten Worker.

## Wdrożenie

Z katalogu `discord-relay`, z tokenem Cloudflare w środowisku
(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, np. `~/tuttitrip-cloudflare.env`):

```bash
npm test            # node --test, bez zależności
npm run deploy      # npx wrangler@4.147.0 deploy
npx wrangler@4.147.0 tail tuttitrip-discord-relay   # logi na żywo
```

Domena została podpięta raz z `override_existing_dns_record: false` (nie
nadpisuje cudzych rekordów DNS). Kolejne `deploy` ją zachowują.

## Webhook organizacji

Org settings, Webhooks, Add webhook:

- Payload URL: `https://tuttitrip-hooks.gburek.app/github`
- Content type: `application/json`
- Secret: wartość `GITHUB_WEBHOOK_SECRET`
- Zdarzenia: "Projects v2 item", "Projects v2", "Issues", "Pull requests"

Z terminala (wymaga zakresu `admin:org_hook`:
`gh auth refresh -h github.com -s admin:org_hook`), sekret czytany z pliku:

```bash
node -e '
const secret = require("fs").readFileSync(process.argv[1], "utf8").trim();
process.stdout.write(JSON.stringify({ name: "web", active: true,
  events: ["projects_v2_item", "projects_v2", "issues", "pull_request"],
  config: { url: "https://tuttitrip-hooks.gburek.app/github", content_type: "json", secret, insecure_ssl: "0" } }));
' ~/tuttitrip-github-webhook.secret | gh api orgs/HackYeah-TuttiTripTeam/hooks --input - -q '.id'
```

## Rotacja

- Webhook Discorda: nowy URL w Discordzie, potem `secret put
  DISCORD_WEBHOOK_URL` tutaj i `gh secret set DISCORD_WEBHOOK_URL` w czterech
  repozytoriach (patrz CONTRIBUTING.md, "Powiadomienia (Discord)").
- Sekret webhooka GitHub: nowy losowy sekret, `secret put
  GITHUB_WEBHOOK_SECRET`, potem ta sama wartość w ustawieniach webhooka
  organizacji (do tego czasu dostarczenia dostają 401).
