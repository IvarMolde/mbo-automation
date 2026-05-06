# 🏗️ TEKNISK OVERSIKT - MBO-AUTOMATISERING

---

## 📐 ARKITEKTUR

```
┌─────────────────────────────────────────────────────┐
│           VERCEL DEPLOYMENT                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐  │
│  │ Express Server (server.js)                  │  │
│  │ ├─ POST /api/generer (manuell)              │  │
│  │ ├─ POST /api/send (send hefte)              │  │
│  │ ├─ POST /api/cron (automatisk hver onsdag)  │  │
│  │ ├─ GET  /api/kapitler (oversikt)            │  │
│  │ └─ POST /api/test-email (test)              │  │
│  └─────────────────────────────────────────────┘  │
│           ↓ ↓ ↓                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │ BUSINESS LOGIC (lib/)                       │  │
│  │ ├─ parser.js (årsplan-data)                 │  │
│  │ ├─ gemini.js (AI-generering)                │  │
│  │ ├─ wordGenerator.js (docx-builder)          │  │
│  │ ├─ pptxGenerator.js (pptx-builder)          │  │
│  │ └─ emailSender.js (SMTP)                    │  │
│  └─────────────────────────────────────────────┘  │
│           ↓ ↓ ↓                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │ EKSTERNE TJENESTER                          │  │
│  │ ├─ Google Cloud Vertex AI (Gemini)          │  │
│  │ ├─ Gmail SMTP (email)                       │  │
│  │ └─ Environment Variables                    │  │
│  └─────────────────────────────────────────────┘  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 📦 DEPENDENCIES

```json
{
  "express": "^4.18.2",          // HTTP framework
  "@google-cloud/vertexai": "^1.0.0", // Gemini API
  "docx": "^8.5.0",              // Word (.docx) builder
  "pptxgen": "^3.12.0",          // PowerPoint builder
  "nodemailer": "^6.9.7",        // Email SMTP
  "cors": "^2.8.5",              // Cross-origin
  "body-parser": "^1.20.2"       // JSON parsing
}
```

---

## 📁 FILKART

### **server.js** (533 lines)
Hoved Express-app med alle API-endepunkter.

**Init:**
- `initGemini(projectId)` - Starter Gemini
- `initEmail(user, password)` - Starter email

**Routes:**
```
GET  /                    → Health check
POST /api/generer         → Generer hefte
POST /api/send            → Send hefte
GET  /api/kapitler        → List kapitler
POST /api/test-email      → Test email
POST /api/cron            → Cron job (Wed 12:00)
```

**Cron-job:**
- Kjøres automatisk onsdager 12:00 CET
- Beregner uke-nummer
- Henter kapittel fra årsplan
- Genererer og sender

---

### **lib/parser.js** (250 lines)
Årsplan-data (22 kapitler, hardkodet).

**Data-struktur:**
```javascript
AARPLAN = {
  semester: "2026-2027",
  maaneder: [
    {
      maaned: "August",
      uke: "34-35",
      kapitler: [1]
    },
    ...
  ],
  kapitler: {
    1: {
      nummer: 1,
      yrke: "Renholder",
      grammatikk: "...",
      arbeidsnorskTema: "...",
      cefrNivaa: "A2",
      ...
    },
    ...
  }
}
```

**Funksjoner:**
- `getKapittelForUke(uke)` - Hent kapittel basert på uke
- `getKapittel(nummer)` - Hent spesifikk kapittel
- `getAllKapitler()` - List alle

---

### **lib/gemini.js** (300 lines)
Gemini API-integrasjon med CEFR-kontekst.

**Init:**
```javascript
await initGemini(projectId, location)
// Bruker @google-cloud/vertexai
// Model: gemini-2.5-flash
```

**Funksjoner:**

```javascript
// Generer arbeidshefte-innhold
const arbeidshefte = await genererArbeidshefte(kapittel)
// Returnerer:
{
  lesetekster: [
    { tittel, type, tekst, vanskelighetsgrad }
  ],
  ordliste: [
    { ord, ordklasse, forklaring, setning }
  ],
  oppgaver: {
    basis: [ oppgave-objekt ],
    utfordringer: [ oppgave-objekt ]
  },
  presentasjonTekst: "..."
}

// Generer presentasjons-slides
const presentasjon = await genererPresentasjon(kapittel, arbeidshefte)
// Returnerer:
{
  slides: [
    { nummer, tittel, innhold, spørsmål }
  ]
}
```

**Prompt-engineering:**
- CEFR A2: 1000-1500 ord, korte setninger (5-15 ord)
- CEFR B1: 1500-2500 ord, varierte setninger (10-25 ord)
- Oppgaver tilpasset nivå
- Autentisk arbeidsliv-kontekst
- Grammatikkfokus integrert naturlig

---

### **lib/wordGenerator.js** (350 lines)
Word (.docx) hefte-builder basert på designmalen.

**Fargene (MBO):**
```javascript
marine: "003057"   // #003057 (nav-blå)
teal: "005F73"     // #005F73 (teal)
amber: "EE9B00"    // #EE9B00 (gull)
night: "001219"    // #001219 (mørk)
```

**Struktur:**

```javascript
const doc = await genererWordHefte(kapittel, arbeidshefte, uke)
// Returnerer Buffer som kan skrives til fil

// Dokument-oppbygging:
1. Header-tabell (skole + tema + uke)
2. Læringsmål (6 punkter)
3. For hver lesetekst:
   - Tekst-boks (teal border)
   - Oppgaver (01, 02, 03... i amber)
4. Ordliste-tabell (20 ord)
5. Fasit-seksjon
```

**Oppgavetyper:**
- `leseforstaelse` - 5 a-e spørsmål
- `sant_usant` - 5 sant/usant påstander
- `ordparing` - Match ord-def
- `multiple_choice` - 4 svaralternativer
- `skriveoppgave` - 80-120 ord
- `ordrekkefølge` - Sett ord i rekkefølge
- `grammatikk` - Fokusert oppgave
- `kompleks_skriving` - 150-200 ord

---

### **lib/pptxGenerator.js** (250 lines)
PowerPoint (.pptx) presentasjons-builder.

**Slides:**

```javascript
const pptx = await genererPPTX(kapittel, presentasjonsData, uke)
// Returnerer Buffer

// 5 slides:
1. Tittelslide (marine bakgrunn, amber tekst)
2-4. Innholdsslides (teal header-bar)
5. Oppgave-oversikt slide
```

**Layout:**
- 10" x 5.625" (16:9)
- Header-bar teal med hvit tekst
- Innhold Arial, 16-18pt
- Refleksjonsspørsmål i grå boks med amber border

---

### **lib/emailSender.js** (120 lines)
Email-sending via Gmail SMTP.

**Init:**
```javascript
await initEmail(gmailAdresse, appPassword)
// Bruker nodemailer med Gmail SMTP:
// service: "gmail"
// auth: { user, pass: appPassword }
```

**Funksjoner:**

```javascript
// Send hefte på epost
await sendHefte(
  motaker,      // "ivar@example.no"
  kapittel,     // Kapittel-objekt
  wordBuffer,   // Word file
  pptxBuffer,   // PowerPoint file
  uke           // Uke-nummer
)

// Send test-email
await sendTestEmail(motaker)
```

**Email-innhold:**
- HTML-formatert
- Kapittel-info (yrke, grammatikk, tema, CEFR-nivå)
- 2 vedlegg (Word + PowerPoint)
- Tips for bruk i klasserom

---

## 🔗 INTEGRASJONSFLYT

### **Manuell API-kall:**

```
POST /api/send
  ↓
server.js: sendHefte()
  ↓
1. genererArbeidshefte(kapittel)
   → Gemini API genererer innhold JSON
   ↓
2. genererPresentasjon(kapittel, arbeidshefte)
   → Gemini API genererer slides JSON
   ↓
3. genererWordHefte(kapittel, arbeidshefte, uke)
   → docx-bibliotek lager .docx fil
   ↓
4. genererPPTX(kapittel, presentasjon, uke)
   → pptxgen-bibliotek lager .pptx fil
   ↓
5. sendHefte(...)
   → nodemailer sender epost via Gmail
   ↓
✅ Epost motatt med vedlegg
```

### **Automatisk Cron-kall (onsdager 12:00):**

```
Vercel Cron Trigger
  ↓
POST /api/cron (med Authorization header)
  ↓
[Samme som over]
  ↓
Email sendt til RECIPIENT_EMAIL
```

---

## 🔐 MILJØVARIABLER

```env
# Google Cloud
GCP_PROJECT_ID=my-project-123456

# Gmail
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=16charpassword

# Email-motaker
RECIPIENT_EMAIL=ivar.andre.overland@molde.kommune.no

# Cron-sikkerhet
CRON_SECRET=hemmelig-key-abc123

# Server
PORT=3000
NODE_ENV=production
```

---

## 📊 GEMINI PROMPT-STRUCTURE

```
1. KONTEKST
   - "Du er erfaren norskdommer..."
   - "Voksne innvandrere i Norge..."

2. KAPITTELINFORMASJON
   - Yrke
   - Grammatikkfokus
   - Arbeidsnorsk-tema
   - CEFR-nivå

3. CEFR-RETNINGSLINJER
   - Ordforråd (ord-antall)
   - Setningslengde
   - Grammatikk
   - Oppgavetyper

4. OPPGAVE
   - "Generer JSON med følgende struktur:"

5. STRUKTUR (JSON)
   - lesetekster[]
   - ordliste[]
   - oppgaver{basis[], utfordringer[]}
   - presentasjonTekst

6. KRAV
   - Autentisk arbeidsliv
   - CEFR-tilpasset
   - Progresjon
```

---

## ⚙️ VERCEL CRON CONFIGURATION

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "0 12 * * WED"  // 12:00 UTC = 13:00 CET
    }
  ]
}
```

**Schedule-format:** CRON expression (Unix)
- `0` = minute
- `12` = hour (UTC)
- `*` = any day of month
- `*` = any month
- `WED` = Wednesday

**For 12:00 CET**, må du justere UTC:
- CET (vinter): UTC+1 → `0 11 * * WED`
- CEST (sommer): UTC+2 → `0 10 * * WED`

*Vercel håndterer sommertid automatisk*

---

## 🔄 DATAFLYT

### **Generering (detaljert):**

```
1. ÅRSPLAN-PARSING
   ├─ Uke-nummer
   ├─ Finn kapittel fra AARPLAN-objekt
   ├─ Hent metadata (yrke, grammatikk, tema, nivå)

2. GEMINI-GENERERING
   ├─ Build prompt med CEFR-kontekst
   ├─ Call API via VertexAI
   ├─ Parse JSON response
   ├─ Lag arbeitshefte-objekt
   │   ├─ 3-5 lesetekster (80-150 ord)
   │   ├─ 20 ordliste-ord
   │   ├─ 5 basisoppgaver
   │   ├─ 3 utfordringer
   │   └─ Presentasjons-tekst

3. WORD-BYGGING
   ├─ Lag header-tabell (marine)
   ├─ Lag læringsmål-boks (teal bakgrunn)
   ├─ For hver tekst:
   │   ├─ Tekst-tabell (teal border)
   │   └─ Oppgaver (amber nummering)
   ├─ Ordliste-tabell (3 kolonner)
   ├─ Fasit-seksjon
   └─ Generer buffer (docx fil)

4. POWERPOINT-BYGGING
   ├─ Slide 1: Tittel (marine bakgrunn)
   ├─ Slide 2-4: Innhold (teal header)
   ├─ Slide 5: Oppgaver-oversikt
   └─ Generer buffer (pptx fil)

5. EMAIL-SENDING
   ├─ Bygg HTML med kapittel-info
   ├─ Attach Word file
   ├─ Attach PowerPoint file
   ├─ Send via Gmail SMTP
   └─ ✅ Ferdig
```

---

## 📈 PERFORMANCE

**Typiske responstider:**

```
API /api/test-email      ~1 sekund
API /api/generer         ~25 sekunder (Gemini)
API /api/send            ~30 sekunder (generer + send)
Cron /api/cron           ~35 sekunder
```

**Bottleneck:** Gemini API (25-30 sekunder per generering)

**Optimering:**
- Caching av Gemini-response (hvis nødvendig)
- Async/await (allerede implementert)
- Worker-based processing (future)

---

## 🔒 SIKKERHET

**API Security:**
- Cron protected med `Authorization: Bearer CRON_SECRET`
- Ingen API-nøkler eksponert i client
- Environment variables i Vercel (ikke i repo)

**Gmail Security:**
- App Password (16 tegn), ikke vanlig passord
- 2FA required
- Nodemailer SMTP over TLS

**Google Cloud Security:**
- Service Account (ikke email-brukernavn)
- JSON-nøkkel lagret lokalt (ikke i repo)
- IAM-roller begrenset (Vertex AI User)

---

## 📝 KODESTANDARD

**Language:** JavaScript (ES Modules)
**Style:** Node.js best practices
**Naming:** camelCase for functions, SCREAMING_SNAKE_CASE for constants
**Error Handling:** try/catch + console logging
**Comments:** JSDoc-style for functions

---

## 🧪 TESTING

**Manuell testing:**
```bash
npm run dev              # Lokal server

curl http://localhost:3000/api/kapitler
curl -X POST http://localhost:3000/api/test-email \
  -H "Content-Type: application/json" \
  -d '{"motaker": "test@email.no"}'
curl -X POST http://localhost:3000/api/generer \
  -H "Content-Type: application/json" \
  -d '{"kapitelNummer": 1, "uke": 34}'
```

**Produksjonssending:**
- Første onsdag etter deploy
- Sjekk mail
- Åpne og verifiser innhold

---

## 🚀 DEPLOYMENT COMMANDS

```bash
# Lokal development
npm install
npm run dev

# Vercel deployment
git push origin main
# Vercel auto-builds og deployer

# Manual Vercel deployment
npx vercel --prod
```

---

**Laget av Claude for Molde voksenopplæringssenter | Mai 2026**
