import { VertexAI } from "@google-cloud/vertexai";
import { env } from "./config.js";
import { getServiceAccountCredentials } from "./gcpCredentials.js";
import {
  ekstraNivaLabel,
  ekstraOppgaverDataSchema,
  ekstraTemaLabel,
  temaToTekstType,
  type EkstraNiva,
  type EkstraOppgaverData,
  type EkstraTema
} from "./ekstraOppgaverTypes.js";
import type { Kapittel, OppgaveMal } from "./types.js";

export type GenererEkstraResult = {
  data: EkstraOppgaverData;
  source: "gemini" | "fallback";
  errorMessage?: string;
};

function createVertexClient(): VertexAI {
  const credentials = getServiceAccountCredentials();
  return new VertexAI({
    project: env.GCP_PROJECT_ID!,
    location: env.GCP_LOCATION,
    ...(credentials ? { googleAuthOptions: { credentials } } : {})
  });
}

function defaultOppgaver(kapittel: Kapittel): OppgaveMal[] {
  return (
    kapittel.oppgavestruktur ?? [
      { nummer: 1, type: "leseforstaelse", beskrivelse: "Leseforståelse (a-e), spørsmål til teksten" },
      { nummer: 2, type: "variert", beskrivelse: "Variert oppgave (flervalg, sant/usant eller finn par)" },
      { nummer: 3, type: "fyll_inn_setningsstruktur", beskrivelse: "Fyll inn / setningsstruktur med ordbank" },
      { nummer: 4, type: "skriveoppgave", beskrivelse: "Skriveoppgave / oppsummering" },
      { nummer: 5, type: "muntlig", beskrivelse: "Muntlig øvelse, rollespill eller parøvelse" }
    ]
  );
}

function nivaInstruction(niva: EkstraNiva, cefr: string): string {
  if (niva === "enklere") {
    return [
      "NIVÅ: ENKLERE (for elever som trenger mer støtte).",
      `- Under CEFR ${cefr}: kortere setninger, færre nye ord, tydelige instruksjoner, mer støtte i oppgavene.`,
      "- Lesetekster ca. 60–90 ord. Oppgaver med konkrete svar.",
      "- Forklar vanskelige ord i parentes der det trengs."
    ].join("\n");
  }
  return [
    "NIVÅ: VANSKELIGERE (for elever som trenger ekstra utfordring).",
    `- Over typisk ${cefr}: lengre setninger, mer nyansert ordforråd, oppgaver som krever begrunnelse.`,
    "- Lesetekster ca. 100–140 ord. Flere åpne spørsmål.",
    "- Be eleven sammenligne, forklare hvorfor, eller bruke grammatikk i egne situasjoner."
  ].join("\n");
}

function extractJsonCandidate(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) return cleaned;
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return cleaned.slice(start, end + 1);
  return cleaned;
}

function createFallbackEkstra(
  kapittel: Kapittel,
  niva: EkstraNiva,
  temaer: EkstraTema[]
): EkstraOppgaverData {
  const oppg = defaultOppgaver(kapittel);
  const tekstTemaer = temaer.filter((t) => t !== "grammatikk");
  const tekstSeksjoner = tekstTemaer.map((tema, i) => ({
    nummer: i + 1,
    type: temaToTekstType(tema),
    tittel: `${ekstraTemaLabel[tema]} · ${kapittel.yrke}`,
    tekst:
      `Dette er en midlertidig ${niva}-tekst om ${kapittel.yrke} og temaet ${kapittel.arbeidsnorskTema}. ` +
      `Teksten skal erstattes av Gemini. Grammatikkfokus: ${kapittel.grammatikk}.`,
    oppgaver: oppg.map((o) => ({
      nummer: o.nummer,
      type: o.type,
      tittel: `Oppgave ${o.nummer}: ${o.type}`,
      innhold: `${o.beskrivelse} (${niva} nivå).`
    }))
  }));

  const includeGram = temaer.includes("grammatikk");
  return {
    niva,
    tekstSeksjoner,
    grammatikk: includeGram
      ? {
          forklaring: {
            tittel: kapittel.grammatikk,
            forklaring:
              `${kapittel.grammatikk} hjelper deg å snakke og skrive klarere norsk på jobb.\n\n` +
              `Vi bruker denne grammatikken for å fortelle hva som skjer, spørre om noe, eller forklare hvorfor. ` +
              `Les eksemplene, og prøv å lage egne korte setninger fra arbeidshverdagen din.`,
            eksempler: [
              `På jobben øver vi på ${kapittel.grammatikk.toLowerCase()}.`,
              `Kan du lage en setning med ${kapittel.grammatikk.toLowerCase()}?`,
              `I pausen snakker vi om ${kapittel.grammatikk.toLowerCase()}.`,
              `En kollega forklarer ${kapittel.grammatikk.toLowerCase()} med et eksempel.`
            ],
            huskeregel: `Husk hvorfor du bruker ${kapittel.grammatikk.toLowerCase()}: for at budskapet skal bli tydelig.`
          },
          eksempeltekst: {
            tittel: `Eksempel: ${kapittel.grammatikk} i bruk`,
            tekst:
              `I dag på jobb snakker Ali og Nora om planer. De bruker ${kapittel.grammatikk.toLowerCase()} ` +
              `for å forklare hva som skjer nå, og hva som skal skje senere. Nora sier en kort setning, ` +
              `og Ali svarer. Til slutt skriver de ned to egne eksempler.`
          },
          oppgaver: oppg.slice(0, 4).map((o) => ({
            nummer: o.nummer,
            type: o.type,
            tittel: `Grammatikk · oppgave ${o.nummer}`,
            innhold: `${o.beskrivelse} Knytt svaret til «${kapittel.grammatikk}».`
          }))
        }
      : undefined,
    fasit: `Fasit (${ekstraNivaLabel[niva]}): se svar på lukkede oppgaver. Åpne oppgaver har flere mulige svar.`
  };
}

export async function genererEkstraOppgaver(
  kapittel: Kapittel,
  opts: { niva: EkstraNiva; temaer: EkstraTema[] }
): Promise<GenererEkstraResult> {
  const temaer = [...new Set(opts.temaer)];
  if (temaer.length === 0) {
    throw new Error("Velg minst ett tema for ekstraoppgaver.");
  }

  if (!env.GCP_PROJECT_ID) {
    return {
      data: createFallbackEkstra(kapittel, opts.niva, temaer),
      source: "fallback",
      errorMessage: "GCP_PROJECT_ID mangler"
    };
  }

  try {
    const vertex = createVertexClient();
    const model = vertex.getGenerativeModel({ model: env.GEMINI_MODEL });
    const oppg = defaultOppgaver(kapittel);
    const tekstTemaer = temaer.filter((t) => t !== "grammatikk");
    const includeGram = temaer.includes("grammatikk");
    const oppgaveLinjer = oppg.map((o) => `  ${o.nummer}. ${o.type}: ${o.beskrivelse}`).join("\n");
    const temaLinjer = tekstTemaer
      .map((t, i) => `  ${i + 1}. type=${temaToTekstType(t)} label=${ekstraTemaLabel[t]}`)
      .join("\n");

    const prompt = `Du er fagutvikler i norskopplæring for voksne (MBO A2–B1).
Lag et EKSTRAOPPGAVE-hefte som tillegg til kapittel ${kapittel.nummer}.
Dette er IKKE hovedheftet — kun ekstra trening.

Yrke: ${kapittel.yrke}
Arbeidsnorsk-tema: ${kapittel.arbeidsnorskTema}
Grammatikk (ukas tema): ${kapittel.grammatikk}
CEFR: ${kapittel.cefrNivaa}
Nivåmerke: ${ekstraNivaLabel[opts.niva]}

${nivaInstruction(opts.niva, kapittel.cefrNivaa)}

Oppgavestruktur (samme oppsett under hver tekst / grammatikkblokk):
${oppgaveLinjer}

Teksttemaer som skal genereres (nøyaktig disse, i denne rekkefølgen):
${temaLinjer || "  (ingen vanlige teksttemaer — kun grammatikk hvis valgt)"}

${
  includeGram
    ? `GRAMMATIKK er valgt. Du MÅ lage:
- forklaring: hva regelen er, NÅR den brukes, og HVORFOR den er nyttig for eleven (hensikt i norsk språk / jobb/hverdag). Språk på ${kapittel.cefrNivaa}.
- minst 4 eksempelsetninger i forklaring.eksempler
- kort huskeregel
- eksempeltekst: kort tekst (70–110 ord) der grammatikken brukes naturlig i sammenheng
- oppgaver knyttet til forklaring + eksempeltekst (samme oppgavetyper som over)`
    : "Ikke inkluder grammatikk-objekt."
}

Krav:
- Marker deloppgaver 1a, 1b, 1c osv.
- Realistisk arbeidslivsnært innhold knyttet til ${kapittel.yrke}.
- Returner KUN gyldig JSON.

{
  "niva": "${opts.niva}",
  "tekstSeksjoner": [
    {
      "nummer": 1,
      "type": "lareverk",
      "tittel": "string",
      "tekst": "string",
      "oppgaver": [{ "nummer": 1, "type": "leseforstaelse", "tittel": "string", "innhold": "string" }]
    }
  ],
  ${
    includeGram
      ? `"grammatikk": {
    "forklaring": {
      "tittel": "${kapittel.grammatikk}",
      "forklaring": "2–4 korte avsnitt med hensikt og bruk.",
      "eksempler": ["...", "...", "...", "..."],
      "huskeregel": "..."
    },
    "eksempeltekst": { "tittel": "string", "tekst": "string" },
    "oppgaver": [{ "nummer": 1, "type": "leseforstaelse", "tittel": "string", "innhold": "string" }]
  },`
      : ""
  }
  "fasit": "string"
}`;

    const response = await model.generateContent(prompt);
    const text = response.response.candidates?.[0]?.content?.parts?.[0];
    const content = typeof text === "object" && "text" in text ? text.text : "";
    if (!content) {
      return {
        data: createFallbackEkstra(kapittel, opts.niva, temaer),
        source: "fallback",
        errorMessage: "Tom respons fra Gemini"
      };
    }

    const parsed = JSON.parse(extractJsonCandidate(content));
    parsed.niva = opts.niva;
    if (!includeGram) delete parsed.grammatikk;
    if (!Array.isArray(parsed.tekstSeksjoner)) parsed.tekstSeksjoner = [];
    if (tekstTemaer.length === 0) parsed.tekstSeksjoner = [];
    if (typeof parsed.fasit !== "string" || parsed.fasit.length < 10) {
      parsed.fasit = `Fasit for ekstraoppgaver (${ekstraNivaLabel[opts.niva]}).`;
    }

    const validated = ekstraOppgaverDataSchema.parse(parsed);
    return { data: validated, source: "gemini" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[ekstra] Gemini feilet:", errorMessage);
    return {
      data: createFallbackEkstra(kapittel, opts.niva, temaer),
      source: "fallback",
      errorMessage
    };
  }
}
