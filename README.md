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
