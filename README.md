# MBO Automation (TypeScript)

TypeScript-basert API for generering og utsending av arbeidshefter, pluss nettside for årsplanoversikt.

## Årsplan-nettside (GitHub Pages)

Nettsiden viser hele årsplanen uke for uke (kompakt oversikt + «Åpne detaljer»).

- **Kode:** [`web/`](web/)
- **Lokal utvikling:** `npm run dev:web` (åpner Vite på localhost)
- **Produksjon:** GitHub Pages etter push til `main`

**URL (når Pages er aktivert):**  
https://ivarmolde.github.io/mbo-automation/

### Aktiver GitHub Pages (engangsjobb)

1. GitHub → repo **Settings** → **Pages**
2. **Source:** GitHub Actions
3. Vent til workflow **Deploy GitHub Pages** er grønn etter push

### Navigasjon på nettsiden

- **Oversikt** — alle uker, gruppert i perioder (gjeldende plan)
- **Denne uken** — zoom på inneværende ISO-uke
- **Perioder** — hopp til en måned
- **Admin** — lås ferieuker og forskyv plan (krever `ADMIN_TOKEN`)
- **Om** — metadata

### Dynamisk plan (fase 2)

- `GET /api/plan` — grunnplan + gjeldende (effektiv) plan
- `POST /api/plan/lock` / `unlock` / `shift` / `reset` — krever `Authorization: Bearer <ADMIN_TOKEN>`
- Lokalt lagres endringer i `data/plan-state.json`
- På Vercel: sett **Turso** (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) for varig lagring
- Sett også `ADMIN_TOKEN` (minst 12 tegn) og `CORS_ALLOWED_ORIGINS=https://ivarmolde.github.io`

Senere fase: e-postmottakere med avmelding.

## Kom i gang (API)

1. Kopier `.env.example` til `.env`
2. Fyll ut nødvendige miljøvariabler
3. Installer og kjør

```bash
npm install
npm run dev
```

## Kvalitetssjekk

```bash
npm run check
npm run test
npm run verify
npm run build:web
```

`CORS_ALLOWED_ORIGINS` kan settes til kommaseparerte origin-domener i produksjon,
for eksempel `https://example.no,https://admin.example.no`.
Rate limiting kan justeres med `RATE_LIMIT_WINDOW_MS` og `RATE_LIMIT_MAX_REQUESTS`.

## Endepunkter

- `GET /` - health check
- `GET /api/kapitler` - liste over kapitler
- `POST /api/generer` - generer Word-hefte (uten e-post)
- `POST /api/send` - generer og send vedlegg på e-post
- `POST /api/test-email` - test SMTP-oppsett
- `GET /api/cron` og `POST /api/cron` - ukentlig jobb (Bearer `CRON_SECRET`). **Vercel Cron** kaller med **GET** og setter `Authorization: Bearer`-header når `CRON_SECRET` er konfigurert i prosjektet.

## Cron og tidssone

- I [`vercel.json`](vercel.json) er uttrykket i **UTC** (standard for Vercel), f.eks. `0 11 * * 3` = onsdag 11:00 UTC (Vercel krever tall 0–6, ikke `WED`).
- I **Norge** tilsvarer det **12:00 om vinteren (CET)** og **13:00 om sommeren (CEST)** med samme cron-uttrykk. Juster minutt/time i UTC ved behov, eller bruk ekstern scheduler med `Europe/Oslo` om du trenger fast lokal tid året rundt.

## Sikkerhet

- Ingen hemmeligheter i kode.
- Input-validering med `zod`.
- Cron-endepunkt krever `Authorization: Bearer <CRON_SECRET>`.
- CORS kan begrenses med `CORS_ALLOWED_ORIGINS`.
- API-ruter har enkel IP-basert rate limiting.
- Feilrespons i produksjon er sanitert for å unngå lekkasje av intern detaljinformasjon.

## CEFR-styring

- Kuraterte nivåbeskrivelser som Markdown: [`docs/beskrivelser_norskniva_A1_B1.md`](docs/beskrivelser_norskniva_A1_B1.md).
- Alle kapitler inneholder CEFR-nivå (`A2`/`B1`) og `can-do` deskriptorer.
- `gemini`-prompten inkluderer deskriptorer for resepsjon, samhandling og produksjon.
- Innhold valideres strukturelt før det brukes til dokumentgenerering.

## CI

- Pull requests og push til `main`/`master` kjører automatisk typecheck og tester via GitHub Actions.
