import { VertexAI } from "@google-cloud/vertexai";
import { z } from "zod";
import { env } from "./config.js";
import type { ArbeidshefteData, Kapittel, PresentasjonData } from "./types.js";

const arbeidshefteSchema = z.object({
  lesetekster: z.array(
    z.object({
      tittel: z.string().min(3),
      tekst: z.string().min(40)
    })
  ).min(1).max(5),
  ordliste: z.array(
    z.object({
      ord: z.string().min(1),
      forklaring: z.string().min(3),
      eksempel: z.string().min(6)
    })
  ).min(8).max(25),
  oppgaver: z.array(
    z.object({
      tittel: z.string().min(3),
      innhold: z.string().min(15)
    })
  ).min(4).max(12),
  presentasjonTekst: z.string().min(20)
});

function createFallbackArbeidshefte(kapittel: Kapittel): ArbeidshefteData {
  const ordGrense = kapittel.cefrNivaa === "A2" ? "4-10 ord" : "8-18 ord";
  return {
    lesetekster: [
      {
        tittel: `${kapittel.yrke} i praksis`,
        tekst: `I dag jobber vi med temaet ${kapittel.arbeidsnorskTema}. Du bruker tydelig språk, følger rutiner og samarbeider med kolleger på en trygg måte.`
      }
    ],
    ordliste: [
      { ord: "rutine", forklaring: "fast måte å gjøre noe på", eksempel: "Vi følger en fast rutine på jobb." },
      { ord: "samarbeid", forklaring: "å jobbe sammen", eksempel: "Godt samarbeid gir bedre resultater." }
    ],
    oppgaver: [
      { tittel: "Leseforståelse", innhold: "Hva er hovedtema i teksten?" },
      { tittel: "Skriveoppgave", innhold: `Skriv 5-8 setninger med setningslengde på ca. ${ordGrense}.` }
    ],
    presentasjonTekst: `Kapittel ${kapittel.nummer}: ${kapittel.yrke}`
  };
}

function getCefrInstruction(kapittel: Kapittel): string {
  if (kapittel.cefrNivaa === "A2") {
    return [
      "CEFR A2 (handlingsorientert):",
      "- Fokus på kjente, konkrete arbeidssituasjoner i dagligliv/arbeid.",
      "- Språkbruker skal kunne forstå korte tekster og enkle instruksjoner i kjent kontekst.",
      "- Språkbruker skal kunne beskrive erfaringer og rutiner med enkle setninger.",
      "- Setninger skal i hovedsak være korte og tydelige (ca. 4-10 ord).",
      "- Oppgaver skal prioritere forståelse av hovedinnhold, enkel informasjonsinnhenting og enkel skriftlig/muntlig produksjon."
    ].join("\n");
  }

  return [
    "CEFR B1 (handlingsorientert):",
    "- Fokus på arbeidsrelaterte situasjoner der språkbruker må forklare, begrunne og samarbeide.",
    "- Språkbruker skal kunne forstå hovedpunkter i tydelig språk om kjente tema.",
    "- Språkbruker skal kunne produsere sammenhengende tekst om erfaringer, planer og begrunnelser.",
    "- Setninger kan være mer varierte og sammenknyttet (ca. 8-18 ord).",
    "- Oppgaver skal inkludere tolkning, begrunnelse, sammenlikning og funksjonell problemlosning."
  ].join("\n");
}

function extractJsonCandidate(raw: string): string {
  const cleaned = raw.trim();
  if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
    return cleaned;
  }

  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return cleaned.slice(first, last + 1).trim();
  }

  return cleaned;
}

export async function genererArbeidshefte(kapittel: Kapittel): Promise<ArbeidshefteData> {
  if (!env.GCP_PROJECT_ID) {
    return createFallbackArbeidshefte(kapittel);
  }

  try {
    const vertex = new VertexAI({
      project: env.GCP_PROJECT_ID,
      location: env.GCP_LOCATION
    });
    const model = vertex.getGenerativeModel({ model: env.GEMINI_MODEL });
    const prompt = `Du er fagutvikler i norskopplaring for voksne og skal lage CEFR-tilpasset undervisningsinnhold.
Generer et norskopplæringshefte som STRICT JSON for kapittel ${kapittel.nummer}.
Yrke: ${kapittel.yrke}
Tema: ${kapittel.arbeidsnorskTema}
Grammatikk: ${kapittel.grammatikk}
Nivå: ${kapittel.cefrNivaa}
${getCefrInstruction(kapittel)}

Krav:
- Innholdet skal være trygt, realistisk og arbeidslivsnært.
- Bruk tydelige "kan"-mål i oppgaver.
- Integrer grammatikkfokus naturlig i lesetekst og oppgaver.
- Ikke bruk markdown, forklaringer eller ekstra tekst rundt JSON.

Returner kun gyldig JSON med feltene:
{
  "lesetekster": [{ "tittel": "string", "tekst": "string" }],
  "ordliste": [{ "ord": "string", "forklaring": "string", "eksempel": "string" }],
  "oppgaver": [{ "tittel": "string", "innhold": "string" }],
  "presentasjonTekst": "string"
}`;

    const response = await model.generateContent(prompt);
    const text = response.response.candidates?.[0]?.content?.parts?.[0];
    const content = typeof text === "object" && "text" in text ? text.text : "";
    if (!content) return createFallbackArbeidshefte(kapittel);

    const json = extractJsonCandidate(content);
    const parsed = JSON.parse(json);
    const validated = arbeidshefteSchema.parse(parsed);
    return validated;
  } catch {
    return createFallbackArbeidshefte(kapittel);
  }
}

export async function genererPresentasjon(
  kapittel: Kapittel,
  arbeidshefte: ArbeidshefteData
): Promise<PresentasjonData> {
  return {
    slides: [
      { tittel: `Kapittel ${kapittel.nummer}`, innhold: arbeidshefte.presentasjonTekst },
      { tittel: "Yrke og tema", innhold: `${kapittel.yrke} - ${kapittel.arbeidsnorskTema}` },
      { tittel: "Grammatikk", innhold: kapittel.grammatikk }
    ]
  };
}
