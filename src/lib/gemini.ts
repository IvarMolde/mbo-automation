import { VertexAI } from "@google-cloud/vertexai";
import { env } from "./config.js";
import { getServiceAccountCredentials } from "./gcpCredentials.js";
import { arbeidshefteDataSchema } from "../schemas/planlegging.js";
import type { ArbeidshefteData, Kapittel, OppgaveMal, PresentasjonData, TematekstMal } from "./types.js";
import { getCefrNivaMarkdownTekst } from "./cefrMarkdown.js";

export type GenererArbeidshefteOptions = {
  laererTilleggsinstruks?: string;
};

export type GenererArbeidshefteResult = {
  data: ArbeidshefteData;
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

function defaultTematekster(kapittel: Kapittel): TematekstMal[] {
  return (
    kapittel.tematekster ?? [
      { nummer: 1, tittel: `${kapittel.yrke} – introduksjon`, type: "lareverk" },
      { nummer: 2, tittel: `${kapittel.yrke} – ${kapittel.arbeidsnorskTema}`, type: "yrke_arbeidsnorsk" },
      { nummer: 3, tittel: kapittel.arbeidsnorskTema, type: "arbeidsnorsk" },
      { nummer: 4, tittel: "Arbeidsliv i Norge", type: "lareverk" },
      { nummer: 5, tittel: `En dag som ${kapittel.yrke.toLowerCase()}`, type: "hverdagssituasjon" }
    ]
  );
}

function defaultOppgavestruktur(kapittel: Kapittel): OppgaveMal[] {
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

function createFallbackArbeidshefte(kapittel: Kapittel): ArbeidshefteData {
  const tematekster = defaultTematekster(kapittel);
  const oppgavestruktur = defaultOppgavestruktur(kapittel);
  const ordAntall = kapittel.ordlisteAntall ?? 20;
  const testAntall = kapittel.kapitteltestAntall ?? 10;

  const tekstSeksjoner = tematekster.map((t) => ({
    nummer: t.nummer,
    type: t.type,
    tittel: t.tittel,
    tekst:
      `Dette er en midlertidig tekst for «${t.tittel}» (${t.type}). ` +
      `Kapittelet handler om yrket ${kapittel.yrke}, temaet ${kapittel.arbeidsnorskTema} ` +
      `og grammatikk: ${kapittel.grammatikk}. Teksten skal erstattes av Gemini-innhold.`,
    oppgaver: oppgavestruktur.map((o) => ({
      nummer: o.nummer,
      type: o.type,
      tittel: `Oppgave ${o.nummer}: ${o.type}`,
      innhold: `${o.beskrivelse} (knyttet til teksten «${t.tittel}»).`
    }))
  }));

  return {
    tekstSeksjoner,
    ordliste: Array.from({ length: Math.max(15, Math.min(ordAntall, 20)) }, (_, i) => ({
      ord: `ord${i + 1}`,
      forklaring: "midlertidig forklaring",
      eksempel: `Eksempelsetning med ord${i + 1} på jobb.`
    })),
    kapitteltest: Array.from({ length: Math.max(5, Math.min(testAntall, 10)) }, (_, i) => ({
      nummer: i + 1,
      innhold: `Kapitteltest oppgave ${i + 1} om ${kapittel.yrke} / ${kapittel.arbeidsnorskTema}.`
    })),
    fasit:
      kapittel.fasitInstruks ??
      "Fasit: svar på lukkede oppgaver og eksempelsvar på åpne oppgaver (midlertidig fallback).",
    presentasjonTekst: `Kapittel ${kapittel.nummer}: ${kapittel.yrke}. Tema: ${kapittel.arbeidsnorskTema}. Grammatikk: ${kapittel.grammatikk}.`
  };
}

function getCefrInstruction(kapittel: Kapittel): string {
  if (kapittel.cefrNivaa === "A2") {
    return [
      "CEFR A2 (handlingsorientert):",
      "- Fokus på kjente, konkrete arbeidssituasjoner i dagligliv/arbeid.",
      "- Setninger skal i hovedsak være korte og tydelige (ca. 4-10 ord).",
      "- Oppgaver skal prioritere forståelse, enkel informasjonsinnhenting og enkel produksjon."
    ].join("\n");
  }

  return [
    "CEFR B1 (handlingsorientert):",
    "- Fokus på å forklare, begrunne og samarbeide i arbeidssituasjoner.",
    "- Setninger kan være mer varierte (ca. 8-18 ord).",
    "- Oppgaver skal inkludere tolkning, begrunnelse og funksjonell problemløsning."
  ].join("\n");
}

function buildArsplanMalBlock(kapittel: Kapittel): string {
  const tematekster = defaultTematekster(kapittel);
  const oppgavestruktur = defaultOppgavestruktur(kapittel);
  const ordAntall = kapittel.ordlisteAntall ?? 20;
  const testAntall = kapittel.kapitteltestAntall ?? 10;

  const tekstLinjer = tematekster
    .map((t) => `  ${t.nummer}. [${t.type}] «${t.tittel}»`)
    .join("\n");
  const oppgaveLinjer = oppgavestruktur
    .map((o) => `  ${o.nummer}. ${o.type}: ${o.beskrivelse}`)
    .join("\n");

  return `
ÅRSPLAN-MAL (må følges eksakt for dette kapittelet):
${kapittel.periodeFokus ? `Periodens fokus: ${kapittel.periodeFokus}` : ""}
Tematekster som skal genereres (én seksjon per tematekst):
${tekstLinjer}

Under HVER tematekst skal du lage disse oppgavetypene:
${oppgaveLinjer}

Ordliste: nøyaktig ${ordAntall} nøkkelord (grammatikk, yrke, arbeidsnorsk) med forklaring og eksempel.
Kapitteltest: nøyaktig ${testAntall} oppsummerende oppgaver.
Fasit: ${kapittel.fasitInstruks ?? "Svar på alle lukkede oppgaver + eksempelsvar på åpne oppgaver."}
`.trim();
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

export async function genererArbeidshefte(
  kapittel: Kapittel,
  options?: GenererArbeidshefteOptions
): Promise<GenererArbeidshefteResult> {
  if (!env.GCP_PROJECT_ID) {
    console.warn("[gemini] GCP_PROJECT_ID mangler — bruker fallback.");
    return {
      data: createFallbackArbeidshefte(kapittel),
      source: "fallback",
      errorMessage: "GCP_PROJECT_ID mangler"
    };
  }

  try {
    const vertex = createVertexClient();
    const model = vertex.getGenerativeModel({ model: env.GEMINI_MODEL });
    const cefrMd = getCefrNivaMarkdownTekst();
    const cefrMdBlock = cefrMd
      ? `\nFaglig kontekst om norsknivå (A1–B1), utdrag fra kuratert dokument:\n${cefrMd}\n`
      : "";
    const laererNote = options?.laererTilleggsinstruks?.trim();
    const laererBlock = laererNote
      ? `\nTillegg fra lærer (følg når det ikke strider mot trygghet, faktasjekk eller likeverd):\n${laererNote}\n`
      : "";

    const tematekster = defaultTematekster(kapittel);
    const oppgavestruktur = defaultOppgavestruktur(kapittel);
    const ordAntall = kapittel.ordlisteAntall ?? 20;
    const testAntall = kapittel.kapitteltestAntall ?? 10;

    const prompt = `Du er fagutvikler i norskopplæring for voksne (MBO A2–B1) og skal lage et komplett arbeidshefte.
Generer STRICT JSON for kapittel ${kapittel.nummer}.
Yrke: ${kapittel.yrke}
Arbeidsnorsk-tema: ${kapittel.arbeidsnorskTema}
Grammatikk: ${kapittel.grammatikk}
Nivå: ${kapittel.cefrNivaa}
${getCefrInstruction(kapittel)}
Can-do:
- Resepsjon: ${kapittel.cefrCanDo.resepsjon.join(" ")}
- Samhandling: ${kapittel.cefrCanDo.samhandling.join(" ")}
- Produksjon: ${kapittel.cefrCanDo.produksjon.join(" ")}
${cefrMdBlock}${laererBlock}

${buildArsplanMalBlock(kapittel)}

Krav:
- Lag nøyaktig ${tematekster.length} objekter i tekstSeksjoner (samme nummer, type og tittel som i årsplan-malen).
- Hver tekst skal være 80–150 ord, realistisk og arbeidslivsnær, med naturlig bruk av grammatikkfokus.
- Under hver tekst: nøyaktig ${oppgavestruktur.length} oppgaver (samme nummer/type som i malen).
- Ordliste: nøyaktig ${ordAntall} ord.
- Kapitteltest: nøyaktig ${testAntall} oppgaver.
- Integrer grammatikk naturlig i tekster og oppgaver.
- Ikke bruk markdown eller tekst utenfor JSON.

Returner kun gyldig JSON:
{
  "tekstSeksjoner": [
    {
      "nummer": 1,
      "type": "lareverk",
      "tittel": "string",
      "tekst": "string",
      "oppgaver": [
        { "nummer": 1, "type": "leseforstaelse", "tittel": "string", "innhold": "string" }
      ]
    }
  ],
  "ordliste": [{ "ord": "string", "forklaring": "string", "eksempel": "string" }],
  "kapitteltest": [{ "nummer": 1, "innhold": "string" }],
  "fasit": "string",
  "presentasjonTekst": "string"
}`;

    const response = await model.generateContent(prompt);
    const text = response.response.candidates?.[0]?.content?.parts?.[0];
    const content = typeof text === "object" && "text" in text ? text.text : "";
    if (!content) {
      console.error("[gemini] Tom respons fra modellen.");
      return {
        data: createFallbackArbeidshefte(kapittel),
        source: "fallback",
        errorMessage: "Tom respons fra Gemini"
      };
    }

    const json = extractJsonCandidate(content);
    const parsed = JSON.parse(json);
    const validated = arbeidshefteDataSchema.parse(parsed);
    return { data: validated, source: "gemini" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[gemini] Feilet, bruker fallback:", errorMessage);
    return {
      data: createFallbackArbeidshefte(kapittel),
      source: "fallback",
      errorMessage
    };
  }
}

export async function genererPresentasjon(
  kapittel: Kapittel,
  arbeidshefte: ArbeidshefteData
): Promise<PresentasjonData> {
  const slides = [
    { tittel: `Kapittel ${kapittel.nummer}`, innhold: arbeidshefte.presentasjonTekst },
    { tittel: "Yrke og tema", innhold: `${kapittel.yrke} – ${kapittel.arbeidsnorskTema}` },
    { tittel: "Grammatikk", innhold: kapittel.grammatikk }
  ];

  for (const seksjon of arbeidshefte.tekstSeksjoner.slice(0, 5)) {
    slides.push({
      tittel: seksjon.tittel,
      innhold: seksjon.tekst.slice(0, 400)
    });
  }

  return { slides };
}
