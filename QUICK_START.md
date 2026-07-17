# QUICK START - MBO-AUTOMATISERING

> Primær runtime er TypeScript under `src/`. Kjør `npm run verify` før push.

**TL;DR:** Fra 0 til automatisert hefte-sending på ca. 1 time.

---

## Minimalkrav

```
✓ Google Cloud Account
✓ Gmail-konto (med 2FA)
✓ GitHub-konto
✓ Vercel-konto
```

---

## Setup

### 1. Google Cloud

```
1. console.cloud.google.com → New Project → mbo-automation
2. Søk "Vertex AI API" → ENABLE
3. IAM & Admin → Service Accounts → Create
4. Gi rollen "Vertex AI User"
5. Keys → Add Key → JSON → last ned filen
6. Copy PROJECT_ID fra Dashboard
```

**Du har nå:** `GCP_PROJECT_ID` + JSON-fil (innholdet blir `GOOGLE_SERVICE_ACCOUNT_JSON` på Vercel).

### 2. Gmail

```
1. myaccount.google.com/security → verifiser 2FA
2. myaccount.google.com/apppasswords
3. Mail + device → kopier 16-tegns passord (fjern mellomrom)
```

**Du har nå:** `GMAIL_USER` + `GMAIL_APP_PASSWORD`

---

## Deploy på Vercel

### 1. Push til GitHub

```bash
cd mbo-automation
git push -u origin main
```

### 2. Opprett Vercel-prosjekt

1. [vercel.com/new](https://vercel.com/new)
2. Import GitHub-repo: `mbo-automation`
3. Environment Variables:

| Variabel | Verdi |
|----------|--------|
| `GCP_PROJECT_ID` | prosjekt-id fra GCP |
| `GCP_LOCATION` | `europe-north1` |
| `GEMINI_MODEL` | `gemini-2.5-flash` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | hele SA-JSON som én streng |
| `GMAIL_USER` | din@gmail.com |
| `GMAIL_APP_PASSWORD` | 16 tegn uten mellomrom |
| `RECIPIENT_EMAIL` | mottaker for onsdags-cron |
| `CRON_SECRET` | lang tilfeldig streng (≥12 tegn) |
| `NODE_ENV` | `production` |

4. Deploy

`vercel.json` setter `maxDuration: 60` for Gemini + Word/PPTX, og cron `0 11 * * 3` (onsdag 11:00 UTC; Vercel krever tall, ikke `WED`). Når `CRON_SECRET` er satt, sender Vercel Cron automatisk `Authorization: Bearer <CRON_SECRET>` til `/api/cron`.

### 3. Verifiser

```bash
# Health
curl https://DIN-APP.vercel.app/

# Test e-post
curl -X POST https://DIN-APP.vercel.app/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"motaker": "din@email.no"}'

# Manuell cron-test
curl -X POST https://DIN-APP.vercel.app/api/cron \
  -H "Authorization: Bearer DITT_CRON_SECRET"
```

---

## Hva som skjer automatisk

Hver **onsdag 11:00 UTC** (12:00/13:00 norsk tid avhengig av sommertid):

```
Uke beregnes → kapittel fra årsplan → Gemini genererer innhold
→ Word-hefte + PowerPoint → e-post til RECIPIENT_EMAIL
```

---

## API-endepunkter

```bash
GET  /api/kapitler
POST /api/generer      Body: {"kapittelNummer": 1, "uke": 34}
POST /api/send         Body: {"kapittelNummer": 1, "uke": 34, "motaker": "student@email.no"}
POST /api/test-email   Body: {"motaker": "test@email.no"}
POST /api/cron         Header: Authorization: Bearer <CRON_SECRET>
```

---

## Sjekkliste

- [ ] Google Cloud Project opprettet
- [ ] Vertex AI API aktivert
- [ ] Service Account + JSON (Vertex AI User)
- [ ] Gmail App Password
- [ ] GitHub repo oppdatert
- [ ] Vercel opprettet
- [ ] Env-variabler satt (inkl. `GOOGLE_SERVICE_ACCOUNT_JSON`)
- [ ] Deploy vellykket
- [ ] Test-email mottatt
- [ ] Cron synlig under Settings → Crons

---

## Hvis noe ikke fungerer

1. **E-post?** → 2FA aktivert + App Password uten mellomrom
2. **Gemini?** → Vertex AI API + rolle + gyldig `GOOGLE_SERVICE_ACCOUNT_JSON`
3. **Deploy?** → Vercel Logs under Functions
4. **Timeout?** → Sjekk at `maxDuration` er 60 i `vercel.json`
5. **Cron?** → Settings → Crons → Active; `CRON_SECRET` satt

Se `IMPLEMENTERING.md` for mer detaljert setup.
