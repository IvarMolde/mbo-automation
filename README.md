# MBO Automation (TypeScript)

TypeScript-basert API for generering og utsending av arbeidshefter.

## Kom i gang

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
```

## Endepunkter

- `GET /` - health check
- `GET /api/kapitler` - liste over kapitler
- `POST /api/generer` - generer hefte/PPTX (uten e-post)
- `POST /api/send` - generer og send vedlegg på e-post
- `POST /api/test-email` - test SMTP-oppsett
- `POST /api/cron` - sikker cron-trigger (Bearer `CRON_SECRET`)

## Sikkerhet

- Ingen hemmeligheter i kode.
- Input-validering med `zod`.
- Cron-endepunkt krever `Authorization: Bearer <CRON_SECRET>`.

## CEFR-styring

- Alle kapitler inneholder CEFR-nivå (`A2`/`B1`) og `can-do` deskriptorer.
- `gemini`-prompten inkluderer deskriptorer for resepsjon, samhandling og produksjon.
- Innhold valideres strukturelt før det brukes til dokumentgenerering.
