# 🚀 MBO-AUTOMATISERING: KOMPLETT OPPSETTSVEILEDNING

> Statusoppdatering (mai 2026): Løsningen er migrert til TypeScript (`src/`), med API-responskontrakter i Zod, CI-workflow og grunnleggende sikkerhetsherding (CORS allowlist + rate limiting). Se `README.md` for oppdatert driftssannhet.

**Laget 6. mai 2026**  
**For:** Ivar Molde, Molde voksenopplæringssenter  
**Status:** ✅ Klart for Vercel-deployment  

---

## 📦 HVA DU HAR MOTTATT

✅ **Komplett Node.js/Express-app** (`mbo-automation/`)  
✅ **8 JavaScript-filer** med all funksjonalitet  
✅ **Årsplan for 22 kapitler** (hardkodet)  
✅ **Automatisert AI-generering** (Gemini 2.5 Flash)  
✅ **Word (.docx) + PowerPoint (.pptx) builder**  
✅ **Email-sending** (Gmail SMTP)  
✅ **Cron-job** for ukentlig automatisering  

---

## 🎯 ARKITEKTUR OVERSIKT

```
┌─────────────────────────────────────────────┐
│         Vercel Hosted App                   │
├─────────────────────────────────────────────┤
│                                             │
│  ⏰ Cron-job (Onsdager 12:00 CET)          │
│     ↓                                       │
│  📖 Les årsplan → Hent kapittel             │
│     ↓                                       │
│  🤖 Gemini AI → Generer innhold             │
│     ↓                                       │
│  📝 Word builder → Oppgaver + Ordliste      │
│     ↓                                       │
│  🎨 PowerPoint builder → Presentasjon       │
│     ↓                                       │
│  📧 Email sender → Send til deg             │
│                                             │
└─────────────────────────────────────────────┘
```

**API disponibel for manuell bruk:**
```
POST /api/generer  → Lag hefte
POST /api/send     → Send hefte på epost
GET  /api/kapitler → Se alle 22 kapitler
POST /api/test-email → Test email
```

---

## 📋 STEG-FOR-STEG SETUP

### **STEG 1: Google Cloud Setup** (15 min)

1. **Opprett Google Cloud Project:**
   - Gå til [console.cloud.google.com](https://console.cloud.google.com)
   - Klikk "New Project"
   - Navn: `mbo-automation`
   - Opprett

2. **Aktiver Vertex AI API:**
   - Søk: "Vertex AI API"
   - Klikk "ENABLE"
   - Vent på aktivering (2-3 min)

3. **Opprett Service Account:**
   - Meny → IAM & Admin → Service Accounts
   - "Create Service Account"
   - Navn: `mbo-app`
   - Klikk "Create"
   
4. **Gi Service Account tilgang:**
   - Klikk på `mbo-app`-kontoen
   - TAB: "Keys"
   - "Add Key" → "Create new key"
   - Type: JSON
   - **Lagre JSON-filen på datamaskinen din!**

5. **Gi Vertex AI Editor-rolle:**
   - Gå til "Roles"
   - Legg til rolle: "Vertex AI User" (eller "Vertex AI API User")

6. **Kopier PROJECT_ID:**
   - Dashboard → "Project information"
   - Kopier `Project ID` (f.eks. `my-project-123456`)

✅ **Nå har du:**
- `GCP_PROJECT_ID` (eks: `my-project-123456`)
- JSON-fil med service account-nøkkel

---

### **STEG 2: Gmail Setup** (5 min)

1. **Aktiver 2-faktor autentisering:**
   - Gå til [myaccount.google.com/security](https://myaccount.google.com/security)
   - Sjekk at 2FA er aktivert

2. **Generer App Password:**
   - [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
   - Velg: App = "Mail", Device = "Windows/Mac"
   - Kopier **16-tegn passordet** (fjern mellomrom)
   - Eks: `abcdefghijklmnop`

✅ **Nå har du:**
- `GMAIL_USER` (din gmail adresse, eks: `ivar.andre@gmail.com`)
- `GMAIL_APP_PASSWORD` (16-tegn, eks: `abcdefghijklmnop`)

---

### **STEG 3: Lokal Testing** (20 min)

1. **Last ned prosjektet:**
   ```bash
   cd ~/prosjekter  # eller hvor du lagrer kode
   unzip mbo-automation.zip  # hvis du fikk ZIP
   # ELLER
   tar -xzf mbo-automation.tar.gz
   cd mbo-automation
   ```

2. **Installer dependencies:**
   ```bash
   npm install
   ```

3. **Opprett `.env`-fil:**
   ```bash
   cp .env.example .env
   ```

4. **Rediger `.env` med dine verdier:**
   ```
   GCP_PROJECT_ID=my-project-123456
   GMAIL_USER=ivar.andre@gmail.com
   GMAIL_APP_PASSWORD=abcdefghijklmnop
   RECIPIENT_EMAIL=ivar.andre.overland@molde.kommune.no
   CRON_SECRET=hemmelig-cron-key-abc123
   PORT=3000
   NODE_ENV=development
   ```

5. **Start server lokalt:**
   ```bash
   npm run dev
   ```

   Du bør se:
   ```
   ✅ Gemini initialized successfully
   ✅ Email configured successfully
   ✅ Initialisering fullført!
   
   🚀 Server kjører på http://localhost:3000
   ```

6. **Test API-endpunkt (nytt terminal-vindu):**
   ```bash
   # Test 1: Health check
   curl http://localhost:3000
   
   # Test 2: Se alle kapitler
   curl http://localhost:3000/api/kapitler
   
   # Test 3: Test email
   curl -X POST http://localhost:3000/api/test-email \
     -H "Content-Type: application/json" \
     -d '{"motaker": "din@email.no"}'
   
   # Du bør få epost på 10 sekunder!
   ```

7. **Test hefte-generering (tar ~30 sekunder):**
   ```bash
   curl -X POST http://localhost:3000/api/generer \
     -H "Content-Type: application/json" \
     -d '{"kapitelNummer": 1, "uke": 34}'
   
   # Response viser filstørrelser
   ```

✅ **Hvis alt fungerer lokalt, er du klar for Vercel!**

---

### **STEG 4: Vercel Deployment** (30 min)

1. **Opprett GitHub repo:**
   - Gå til [github.com/new](https://github.com/new)
   - Repo navn: `mbo-automation`
   - Public eller Private (som du ønsker)
   - Klikk "Create"

2. **Push koden til GitHub:**
   ```bash
   cd mbo-automation
   git init
   git add .
   git commit -m "Initial commit: MBO-automatisering"
   git branch -M main
   git remote add origin https://github.com/DITT_BRUKERNAVN/mbo-automation.git
   git push -u origin main
   ```

3. **Opprett Vercel-prosjekt:**
   - Gå til [vercel.com/new](https://vercel.com/new)
   - Logg inn / Registrer deg
   - Velg GitHub repo: `mbo-automation`
   - Klikk "Import"

4. **Sett Environment Variables:**
   - Under "Environment Variables":
   
   ```
   GCP_PROJECT_ID = my-project-123456
   GMAIL_USER = ivar.andre@gmail.com
   GMAIL_APP_PASSWORD = abcdefghijklmnop
   RECIPIENT_EMAIL = ivar.andre.overland@molde.kommune.no
   CRON_SECRET = hemmelig-cron-key-abc123
   ```

5. **Deploy:**
   - Klikk "Deploy"
   - Vent på "✅ Production - Ready"
   - Du får en Vercel URL: `https://your-app.vercel.app`

6. **Test i Vercel:**
   ```bash
   curl https://your-app.vercel.app
   
   # Husk: Bytt YOUR_APP med din faktiske URL!
   ```

✅ **Appen kjører nå på Vercel!**

---

### **STEG 5: Konfigurer Cron-Job** (5 min)

1. **Vercel Dashboard:**
   - Gå til "Settings" → "Crons"
   
2. **Verifiser:**
   - Cron schedule skal være: `0 12 * * WED` ✓
   - Path skal være: `/api/cron` ✓
   - Status skal være: "Active" ✓

3. **Test cron manuelt:**
   ```bash
   curl -X POST https://your-app.vercel.app/api/cron \
     -H "Authorization: Bearer hemmelig-cron-key-abc123"
   ```
   
   Du bør få epost innen 30 sekunder!

✅ **Cron-job kjører hver onsdag 12:00 CET fra nå av!**

---

## 📧 EMAIL-OPPSETTET (VIKTIG!)

**Din epost mottar hver onsdag:**
- `Kap_01_Renholder_uke34.docx` (Word-hefte med oppgaver)
- `Kap_01_Renholder_uke34_presentasjon.pptx` (PowerPoint)

**Innhold i heftene:**
- 3-5 lesetekster (80-150 ord hver)
- 20 viktige ord med norske forklaringer
- 5 basisoppgaver (leseforståelse, sant/usant, ordparing, flervalg, skriving)
- 3 ekstra utfordringer for de flinke
- Fasit

**Farger og design:**
- Følger MBO-designprinsippene dine
- Marine/Teal/Amber-palett
- Profesjonell layout

---

## 🔧 BRUK ETTER SETUP

### **Ukentlig arbeidsflyt:**

1. **Onsdag 12:00 - Hefte mottas automatisk** 📧
2. **Onsdag ettermiddag - Last ned presentasjonen** 📊
3. **Torsdag - Gjennomgang i klassen med PowerPoint** 🎓
4. **Fredag - Elevene får Word-heftet med oppgaver** 📝
5. **Neste uke - Repeat** 🔄

### **Manuell bruk (hvis du vil):**

```bash
# Generer hefte for spesifikk kapittel
curl -X POST https://your-app.vercel.app/api/generer \
  -H "Content-Type: application/json" \
  -d '{"kapitelNummer": 5, "uke": 40}'

# Send til en bestemt epost
curl -X POST https://your-app.vercel.app/api/send \
  -H "Content-Type: application/json" \
  -d '{
    "kapitelNummer": 5,
    "uke": 40,
    "motaker": "elev@example.no"
  }'
```

---

## ✅ SJEKKLISTE

Når alt er satt opp:

- [ ] Google Cloud Project opprettet
- [ ] Vertex AI API aktivert
- [ ] Service Account med JSON-nøkkel
- [ ] Gmail App Password generert
- [ ] Lokal testing vellykket
- [ ] GitHub repo opprettet og pushet
- [ ] Vercel prosjekt opprettet
- [ ] Environment-variabler satt i Vercel
- [ ] Deploy til Vercel vellykket
- [ ] Test API-kall vellykket
- [ ] Cron-job aktiv i Vercel
- [ ] Test-epost motatt
- [ ] Klart for produksjon! 🎉

---

## 🐛 TROUBLESHOOTING

### **"GCP_PROJECT_ID not found"**
→ Verdsett at `GCP_PROJECT_ID` er satt i Vercel Environment Variables  
→ Navn må være EKSAKT (case-sensitive)

### **"Email configuration failed"**
→ Verifiser 2-faktor autentisering er aktivert på Gmail  
→ Bruker du Gmail App Password (16 tegn), ikke vanlig passord  
→ Fjern alle mellomrom fra passordet

### **"Gemini API error: 401"**
→ Sjekk at Service Account har "Vertex AI User"-rolle  
→ Verifiser at Vertex AI API er aktivert i GCP

### **Cron-job kjører ikke**
→ Sjekk Vercel Deployments → Functions
→ Klikk på `/api/cron` - se logger
→ Verifiser `CRON_SECRET` stemmer

### **Hefte-generering tar for lenge**
→ Normalt 20-30 sekunder første gang
→ Gemini har langsom responsid
→ Etter caching blir det raskere

---

## 📚 FILSTRUKTUR (KORT OVERSIKT)

```
mbo-automation/
├── server.js           # Hovedserver + API
├── lib/
│   ├── parser.js       # Årsplan (22 kapitler)
│   ├── gemini.js       # Gemini AI
│   ├── wordGenerator.js # Word-opprett
│   ├── pptxGenerator.js # PowerPoint-opprett
│   └── emailSender.js  # Email-sending
├── package.json        # npm-avhengigheter
├── vercel.json         # Cron + deployment
├── .env.example        # Miljøvariabler
└── README.md           # Dokumentasjon
```

---

## 💡 TIPS OG BEST PRACTICES

1. **Teste lokalt før Vercel** - Enklere å debugge
2. **Behold `.env` hemlig** - Aldri pushe til GitHub!
3. **Moniter Vercel Logs** - Sjekk der hvis noe er galt
4. **Bytt CRON_SECRET** - Gjør det tilfeldig når du setter det opp
5. **Backup JSON-nøkkel** - Lagre den sikkert lokalt
6. **Sjekk Gmail spam** - Første epost kan gå der
7. **Test hefte-kvalitet** - Åpne og les gjennom første gang

---

## 🚀 NESTE STEG ETTER SETUP

1. **Tilpass Gemini-prompt** (hvis ønsket)
   - Rediger `lib/gemini.js` linje 100+
   - Legg til mer kontekst eller spesifisering

2. **Tilpass Word-design** (hvis ønsket)
   - Endre farger i `lib/wordGenerator.js`
   - Legg til logo/header

3. **Legg til flere kapitler** (hvis ønsket)
   - Rediger `lib/parser.js` kapitler-objekt
   - Legg til nye yrker og temaer

4. **Monitor produksjon**
   - Sjekk Vercel Dashboard ukentlig
   - Verifiser at cron-job kjører

---

## 📞 SUPPORT / KONTAKT

Hvis noe ikke fungerer:

1. Sjekk README.md i prosjektet
2. Se Vercel Logs under "Functions"
3. Test lokalt med `npm run dev`
4. Verifiser alle env-variabler

---

## 🎉 GRATULERER!

Du har nå en **fullautomatisert norskopplærings-maskin** som:

✅ Genererer unike hefte hver uke  
✅ Tilpasset CEFR A2-B1 nivå  
✅ Sendes automatisk onsdager 12:00  
✅ Inneholder variert innhold  
✅ Har både basisoppgaver og utfordringer  
✅ Følger dine designprinsipp  
✅ Er skalert for alle 22 kapitler  

**Lykke til! 🚀📚**

---

*Laget med ❤️ av Claude for Molde voksenopplæringssenter*  
*6. mai 2026*
