# ⚡ QUICK START - MBO-AUTOMATISERING

> Statusoppdatering (mai 2026): Primær runtime er TypeScript under `src/`, og oppdatert standardflyt er `npm run verify` før push.

**TL;DR:** Fra 0 til automatisert hefte-sending på 1 time.

---

## 🎯 MINIMALKRAV

```
✓ Google Cloud Account
✓ Gmail konto (med 2FA)
✓ GitHub konto
✓ Vercel konto (gratis)
```

---

## ⚡ 5 MINUTTER SETUP

### 1. **Google Cloud (5 min)**
```
1. console.cloud.google.com → "New Project" → `mbo-automation`
2. Søk "Vertex AI API" → "ENABLE"
3. IAM & Admin → Service Accounts → Create
4. Add Key → JSON → Save file
5. Copy PROJECT_ID fra Dashboard
```

**DU HAR NÅ:** `GCP_PROJECT_ID` + JSON-fil

---

### 2. **Gmail (3 min)**
```
1. myaccount.google.com/security → verifiser 2FA
2. myaccount.google.com/apppasswords
3. Mail + device → Copy 16-tegn password (fjern mellomrom)
```

**DU HAR NÅ:** `GMAIL_USER` + `GMAIL_APP_PASSWORD`

---

## 🚀 DEPLOY PÅ 10 MINUTTER

### 1. **Push til GitHub**
```bash
cd mbo-automation
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOU/mbo-automation.git
git push -u origin main
```

### 2. **Opprett Vercel-prosjekt**
```
1. vercel.com/new
2. Import GitHub repo: mbo-automation
3. Environment Variables:
   - GCP_PROJECT_ID = your-id
   - GMAIL_USER = your@gmail.com
   - GMAIL_APP_PASSWORD = 16charshere
   - RECIPIENT_EMAIL = ivar.andre.overland@molde.kommune.no
   - CRON_SECRET = some-random-string
4. Deploy
```

### 3. **Verifiser**
```bash
# Hent din Vercel URL (f.eks https://mbo-app-123.vercel.app)
curl https://mbo-app-123.vercel.app

# Test email
curl -X POST https://mbo-app-123.vercel.app/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"motaker": "din@email.no"}'
```

✅ **DONE! Appen kjører nå!**

---

## ⏰ HVA SOM SKJER NØDT

Hver **onsdag 12:00 CET:**

```
Uke beregnes ↓
Kapittel hentes fra årsplan ↓
Gemini genererer innhold ↓
Word-hefte lages ↓
PowerPoint lages ↓
Email sendes til deg ↓
PROFIT 📧
```

---

## 🎓 BRUK I KLASSEROMMET

1. **Onsdag 12:00** → Hefte i epost
2. **Torsdag** → Gjennomgang med PowerPoint
3. **Fredag** → Deling av Word-hefte
4. **Hele uken** → Elevene jobber med oppgaver

---

## 🔗 API-ENDEPUNKTER

```bash
# Generer hefte manuelt
POST /api/generer
Body: {"kapittelNummer": 1, "uke": 34}

# Send til elev
POST /api/send
Body: {"kapittelNummer": 1, "uke": 34, "motaker": "student@email.no"}

# Se alle kapitler
GET /api/kapitler

# Test email
POST /api/test-email
Body: {"motaker": "test@email.no"}
```

---

## 📧 HVA DU MOTTAR

Hver onsdag:
- `Kap_01_Renholder_uke34.docx` (arbeidshefte)
- `Kap_01_Renholder_uke34_presentasjon.pptx` (klassepresentasjon)

---

## ✅ SJEKKLISTE

- [ ] Google Cloud Project opprettet
- [ ] Vertex AI API aktivert
- [ ] Service Account + JSON
- [ ] Gmail App Password
- [ ] GitHub repo opprettet
- [ ] Vercel opprettet
- [ ] Env-variabler satt
- [ ] Deploy vellykket
- [ ] Test-email motatt
- [ ] Cron-job aktiv

---

## 🐛 Hvis noe ikke fungerer

1. **Email-feil?** → Sjekk at 2FA er aktivert + App Password riktig
2. **Gemini-feil?** → Verifiser Vertex AI API og Service Account-rolle
3. **Deploy-feil?** → Sjekk Vercel Logs under "Functions"
4. **Cron kjører ikke?** → Settings → Crons → "Active" status

---

## 📖 FULL GUIDE

Se `IMPLEMENTERING.md` for detaljert setup.

---

**Ferdig? Gratulerer! 🎉 Du har nå en fullautomatisert norskopplærings-maskin.**

*Send hefte hver uke. Fokuser på undervisning. La automaten jobbe. 🤖*
