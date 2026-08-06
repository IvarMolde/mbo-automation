import { VertexAI } from "@google-cloud/vertexai";
import { env } from "./config.js";
import { getServiceAccountCredentials } from "./gcpCredentials.js";
import { arbeidshefteDataSchema, hverdagsmatematikkSchema } from "../schemas/planlegging.js";
import type {
  ArbeidshefteData,
  GrammatikkForklaring,
  HverdagsmatematikkData,
  Kapittel,
  OppgaveMal,
  TematekstMal
} from "./types.js";
import { getCefrNivaMarkdownTekst } from "./cefrMarkdown.js";
import {
  MATTE_KATEGORI_LABEL,
  buildMattePromptBlock,
  createConcreteFallbackHverdagsmatematikk,
  isPlaceholderMatte
} from "./hverdagsmatematikk.js";

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

function createFallbackGrammatikkForklaring(emne: string): GrammatikkForklaring {
  const tema = emne.trim() || "Grammatikk";
  return {
    tittel: tema,
    forklaring:
      `${tema} er et viktig tema i norsk. Vi bruker denne grammatikken for å lage klare setninger ` +
      `på jobb og i hverdagen.\n\n` +
      `Les forklaringen og eksemplene nøye. Se hvordan formen endrer seg i setningen. ` +
      `Start med korte setninger, og lag deretter egne eksempler fra arbeidshverdagen din.\n\n` +
      `Når du er usikker: se på eksemplene, si setningen høyt, og skriv den ned. ` +
      `Øving gjør at du husker formen bedre.`,
    eksempler: [
      `Vi snakker om ${tema.toLowerCase()} på kurset.`,
      `Kan du lage en setning med ${tema.toLowerCase()}?`,
      `På jobben bruker jeg ${tema.toLowerCase()} hver dag.`,
      `I pausen øver vi på ${tema.toLowerCase()} sammen.`
    ],
    huskeregel: `Husk: øv på ${tema.toLowerCase()} med egne, korte setninger fra jobben.`
  };
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
    grammatikkForklaring: createFallbackGrammatikkForklaring(kapittel.grammatikk),
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
    hverdagsmatematikk: createConcreteFallbackHverdagsmatematikk(kapittel)
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
  Pedagogisk form i feltet «ord»:
  - Verb i infinitiv MED «å» foran (f.eks. «å rydde», «å stabilisere»).
  - Substantiv MED riktig artikkel en/ei/et (f.eks. «en kollega», «ei hylle», «et lager»).
  - Adjektiv og andre ord uten artikkel (f.eks. «hyggelig»).
Kapitteltest: nøyaktig ${testAntall} oppsummerende oppgaver.
Grammatikkforklaring: lag en lærebokaktig forklaring av «${kapittel.grammatikk}» på nivå ${kapittel.cefrNivaa}
  (presis, korrekt, flere eksempler, enkelt språk A2–B1).
Fasit: ${kapittel.fasitInstruks ?? "Svar på alle lukkede oppgaver + eksempelsvar på åpne oppgaver."}
`.trim();
}

/**
 * Normalize lemma casing for pedagogical ordliste forms (å / en / ei / et).
 * Does not invent missing articles — Gemini must supply correct gender.
 */
export function normalizeOrdlisteOrd(ord: string, forklaring = ""): string {
  let o = ord.trim().replace(/\s+/g, " ");
  if (!o) return o;

  o = o
    .replace(/^Å\s+/u, "å ")
    .replace(/^En\s+/u, "en ")
    .replace(/^Ei\s+/u, "ei ")
    .replace(/^Et\s+/u, "et ")
    .replace(/^å\s+å\s+/iu, "å ");

  const tip = forklaring.toLowerCase();
  const looksLikeVerb = /\bverb\b/.test(tip) || /\binfinitiv\b/.test(tip);
  const hasParticle = /^(å|en|ei|et)\s+/iu.test(o);

  // If marked as verb but missing «å», add it (never invent articles for nouns).
  if (looksLikeVerb && !hasParticle && !/\s/.test(o)) {
    o = `å ${o}`;
  }

  return o;
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

/** Fyll inn manglende felter fra Gemini før Zod-validering. */
function normalizeGeminiPayload(raw: unknown, kapittel?: Kapittel): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.tekstSeksjoner)) {
    data.tekstSeksjoner = data.tekstSeksjoner.map((seksjon, si) => {
      if (!seksjon || typeof seksjon !== "object") return seksjon;
      const s = seksjon as Record<string, unknown>;
      const oppgaver = Array.isArray(s.oppgaver)
        ? s.oppgaver.map((oppgave, oi) => {
            if (!oppgave || typeof oppgave !== "object") return oppgave;
            const o = oppgave as Record<string, unknown>;
            return {
              nummer: typeof o.nummer === "number" ? o.nummer : oi + 1,
              type: String(o.type ?? "oppgave"),
              tittel: String(o.tittel ?? `Oppgave ${oi + 1}`),
              innhold: String(o.innhold ?? "Fullfør oppgaven.")
            };
          })
        : [];
      return {
        nummer: typeof s.nummer === "number" ? s.nummer : si + 1,
        type: String(s.type ?? "lareverk"),
        tittel: String(s.tittel ?? `Tekst ${si + 1}`),
        tekst: String(s.tekst ?? "").padEnd(40, "."),
        oppgaver
      };
    });
  }

  const emne = kapittel?.grammatikk ?? "Grammatikk";
  const fallbackG = createFallbackGrammatikkForklaring(emne);
  const gRaw = data.grammatikkForklaring;
  if (!gRaw || typeof gRaw !== "object") {
    data.grammatikkForklaring = fallbackG;
  } else {
    const g = gRaw as Record<string, unknown>;
    let forklaring = String(g.forklaring ?? g.tekst ?? g.beskrivelse ?? "");
    if (forklaring.length < 80) {
      forklaring = `${forklaring} ${fallbackG.forklaring}`.trim();
    }
    let eksempler = Array.isArray(g.eksempler)
      ? g.eksempler.map((e) => String(e ?? "").trim()).filter((e) => e.length >= 5)
      : [];
    if (eksempler.length < 4) {
      eksempler = [...eksempler, ...fallbackG.eksempler].slice(0, 8);
    }
    const huskeregelRaw = g.huskeregel ?? g.tips ?? g.husk;
    const huskeregel =
      huskeregelRaw != null && String(huskeregelRaw).trim().length >= 8
        ? String(huskeregelRaw).trim()
        : fallbackG.huskeregel;
    data.grammatikkForklaring = {
      tittel: String(g.tittel ?? emne).trim() || emne,
      forklaring,
      eksempler,
      ...(huskeregel ? { huskeregel } : {})
    };
  }

  if (Array.isArray(data.ordliste)) {
    data.ordliste = data.ordliste.map((item, i) => {
      if (!item || typeof item !== "object") {
        return {
          ord: `ord${i + 1}`,
          forklaring: "forklaring mangler",
          eksempel: `Eksempel med ord${i + 1}.`
        };
      }
      const o = item as Record<string, unknown>;
      const forklaring = String(o.forklaring ?? o.betydning ?? "forklaring mangler");
      const ord = normalizeOrdlisteOrd(String(o.ord ?? `ord${i + 1}`), forklaring);
      return {
        ord,
        forklaring,
        eksempel: String(o.eksempel ?? `Eksempel: ${ord} brukes på jobb.`)
      };
    });
  }

  if (Array.isArray(data.kapitteltest)) {
    data.kapitteltest = data.kapitteltest.map((item, i) => {
      if (!item || typeof item !== "object") {
        return { nummer: i + 1, innhold: `Kapitteltest ${i + 1}` };
      }
      const t = item as Record<string, unknown>;
      return {
        nummer: typeof t.nummer === "number" ? t.nummer : i + 1,
        innhold: String(t.innhold ?? t.oppgave ?? `Kapitteltest ${i + 1}`)
      };
    });
  }

  if (typeof data.fasit !== "string" || data.fasit.length < 20) {
    data.fasit = String(data.fasit ?? "Fasit: se svar på lukkede oppgaver og lag eksempelsvar på åpne oppgaver.");
    if ((data.fasit as string).length < 20) {
      data.fasit = `${data.fasit} (utvidet for validering.)`;
    }
  }

  data.hverdagsmatematikk = normalizeHverdagsmatematikkPayload(
    data.hverdagsmatematikk ?? data.hverdagsregning ?? data.matematikk,
    kapittel,
    data.fasitMatematikk
  );

  return data;
}

function normalizeHverdagsmatematikkPayload(
  rawMatte: unknown,
  kapittel?: Kapittel,
  fasitMatematikkExtra?: unknown
): HverdagsmatematikkData {
  const matteFallback = kapittel
    ? createConcreteFallbackHverdagsmatematikk(kapittel)
    : createConcreteFallbackHverdagsmatematikk({
        nummer: 1,
        yrke: "Arbeidstaker",
        grammatikk: "Presens",
        arbeidsnorskTema: "Arbeid",
        cefrNivaa: "A2",
        cefrCanDo: { resepsjon: ["r"], samhandling: ["s"], produksjon: ["p"] }
      });

  if (!rawMatte || typeof rawMatte !== "object") {
    return matteFallback;
  }

  const m = rawMatte as Record<string, unknown>;
  const kategori =
    m.kategori === "tall" || m.kategori === "maling_geometri" || m.kategori === "statistikk"
      ? m.kategori
      : matteFallback.kategori;

  const normOppgaver = (arr: unknown, fallback: typeof matteFallback.niva1) => {
    // Behold delvis svar fra Gemini (≥4) og fyll opp — ikke kast alt for <6.
    if (!Array.isArray(arr) || arr.length < 4) return fallback;
    const mapped = arr.slice(0, 7).map((item, i) => {
      if (!item || typeof item !== "object") {
        return fallback[Math.min(i, fallback.length - 1)]!;
      }
      const o = item as Record<string, unknown>;
      const innhold = String(o.innhold ?? "Regn ut og svar.");
      if (/Midlertidig fallback|erstattes av Gemini/i.test(innhold) || innhold.length < 15) {
        return fallback[Math.min(i, fallback.length - 1)]!;
      }
      return {
        nummer: typeof o.nummer === "number" ? o.nummer : i + 1,
        type: String(o.type ?? "regneoppgave"),
        tittel: String(o.tittel ?? `Oppgave ${i + 1}`),
        innhold: innhold.padEnd(15, ".")
      };
    });
    while (mapped.length < 6) {
      mapped.push(fallback[mapped.length]!);
    }
    return mapped;
  };

  let fagtekst = String(m.fagtekst ?? m.tekst ?? "");
  if (fagtekst.length < 80) {
    fagtekst = `${fagtekst} ${matteFallback.fagtekst}`.trim();
  }
  let fasitMatte = String(m.fasit ?? m.fasitMatematikk ?? fasitMatematikkExtra ?? "");
  if (fasitMatte.length < 20) {
    fasitMatte = matteFallback.fasit;
  }
  const malNiva1 = Array.isArray(m.malNiva1)
    ? m.malNiva1.map((x) => String(x)).filter((x) => x.length >= 5).slice(0, 8)
    : matteFallback.malNiva1;
  const malNiva2 = Array.isArray(m.malNiva2)
    ? m.malNiva2.map((x) => String(x)).filter((x) => x.length >= 5).slice(0, 8)
    : matteFallback.malNiva2;

  const result: HverdagsmatematikkData = {
    kategori,
    kategoriLabel: String(m.kategoriLabel ?? MATTE_KATEGORI_LABEL[kategori]),
    tittel: String(m.tittel ?? matteFallback.tittel).trim() || matteFallback.tittel,
    fagtekst,
    malNiva1: malNiva1.length ? malNiva1 : matteFallback.malNiva1,
    malNiva2: malNiva2.length ? malNiva2 : matteFallback.malNiva2,
    niva1: normOppgaver(m.niva1 ?? m.oppgaverNiva1, matteFallback.niva1),
    niva2: normOppgaver(m.niva2 ?? m.oppgaverNiva2, matteFallback.niva2),
    fasit: fasitMatte
  };

  return isPlaceholderMatte(result) ? matteFallback : result;
}

/** Eget Gemini-kall for matte — mindre JSON, færre trunkeringer enn i hovedheftet. */
async function genererHverdagsmatematikkMedGemini(
  kapittel: Kapittel
): Promise<HverdagsmatematikkData | null> {
  try {
    const vertex = createVertexClient();
    const model = vertex.getGenerativeModel({ model: env.GEMINI_MODEL });
    const prompt = `Du lager KUN hverdagsmatematikk til et MBO-arbeidshefte (voksne, A2–B1).
Yrke: ${kapittel.yrke}. Tema: ${kapittel.arbeidsnorskTema}. Kapittel ${kapittel.nummer}.

${buildMattePromptBlock(kapittel.nummer, kapittel.yrke, kapittel.arbeidsnorskTema)}

Returner KUN gyldig JSON (ingen markdown) med nøyaktig denne formen:
{
  "kategori": "tall",
  "kategoriLabel": "Tall",
  "tittel": "kort tittel",
  "fagtekst": "80-150 ord med konkrete tall elevene skal bruke",
  "malNiva1": ["mål1", "mål2", "mål3"],
  "malNiva2": ["mål1", "mål2", "mål3"],
  "niva1": [
    { "nummer": 1, "type": "les_og_finn_tall", "tittel": "…", "innhold": "Bruk tallene i fagteksten.\\na. …\\nb. …\\nc. …" },
    { "nummer": 2, "type": "regneoppgave", "tittel": "…", "innhold": "Regn ut.\\na. …\\nb. …\\nc. …" },
    { "nummer": 3, "type": "flervalg", "tittel": "…", "innhold": "Kryss av.\\na. …\\nb. …\\nc. …" },
    { "nummer": 4, "type": "fyll_inn", "tittel": "…", "innhold": "Fyll inn.\\na. …\\nb. …\\nc. …" },
    { "nummer": 5, "type": "overslag_vurder", "tittel": "…", "innhold": "Vurder.\\na. …\\nb. …\\nc. …" },
    { "nummer": 6, "type": "kort_begrunnelse", "tittel": "…", "innhold": "Begrunn kort.\\na. …\\nb. …\\nc. …" }
  ],
  "niva2": [
    { "nummer": 1, "type": "regneoppgave", "tittel": "…", "innhold": "Regn ut.\\na. …\\nb. …\\nc. …" },
    { "nummer": 2, "type": "regneoppgave", "tittel": "…", "innhold": "Regn ut.\\na. …\\nb. …\\nc. …" },
    { "nummer": 3, "type": "flervalg", "tittel": "…", "innhold": "Kryss av.\\na. …\\nb. …\\nc. …" },
    { "nummer": 4, "type": "fyll_inn", "tittel": "…", "innhold": "Fyll inn.\\na. …\\nb. …\\nc. …" },
    { "nummer": 5, "type": "tabell_eller_figur", "tittel": "…", "innhold": "Lag tabell/figur.\\na. …\\nb. …\\nc. …" },
    { "nummer": 6, "type": "kort_begrunnelse", "tittel": "…", "innhold": "Begrunn.\\na. …\\nb. …\\nc. …" }
  ],
  "fasit": "Oppgave 1: a. … b. … c. … (osv. for alle oppgaver nivå 1 og 2)"
}
Viktig: hver oppgave skal ha nøyaktig tre deloppgaver a. b. c. med konkrete tall — ikke generiske «bruk tallene»-setninger.`;

    const response = await model.generateContent(prompt);
    const text = response.response.candidates?.[0]?.content?.parts?.[0];
    const content = typeof text === "object" && "text" in text ? text.text : "";
    if (!content) {
      console.error("[gemini] Tom matte-respons.");
      return null;
    }
    const parsed = JSON.parse(extractJsonCandidate(content));
    const normalized = normalizeHverdagsmatematikkPayload(parsed, kapittel);
    const validated = hverdagsmatematikkSchema.parse(normalized);
    if (isPlaceholderMatte(validated)) return null;
    return validated;
  } catch (error) {
    console.error(
      "[gemini] Matte-kall feilet:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
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
      ? `\nKort CEFR-kontekst (utdrag):\n${cefrMd}\n`
      : "";
    const laererNote = options?.laererTilleggsinstruks?.trim();
    const laererBlock = laererNote
      ? `\nTillegg fra lærer (følg når det ikke strider mot trygghet, faktasjekk eller likeverd):\n${laererNote}\n`
      : "";

    const tematekster = defaultTematekster(kapittel);
    const oppgavestruktur = defaultOppgavestruktur(kapittel);
    const ordAntall = kapittel.ordlisteAntall ?? 20;
    const testAntall = kapittel.kapitteltestAntall ?? 10;

    // Norsk og matte i parallell: mindre JSON per kall → færre trunkeringer/timeouts.
    const norskPrompt = `Du er fagutvikler i norskopplæring for voksne (MBO A2–B1) og skal lage norskdelen av et arbeidshefte.
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
- Marker ALLE deloppgaver med bokstav og punktum på egen linje: a. b. c. d. … (ikke 1a, ikke a)).
- Sant/usant: skriv tydelig «Sant eller usant» i tittel/type og lag påstander som a. b. c. …
- Flervalg / kryss av: alternativer som a. b. c. …
- Skriveoppgaver: kort instruks, deretter a. b. c. … (eleven får skrivelinjer i Word).
- Hver deloppgave/alternativ på egen linje. Fasit skal bruke samme merking (Oppgave 1: a. …).
- Ordliste: nøyaktig ${ordAntall} ord.
- Ordliste «ord»-feltet MÅ være i lærbar form: verb som «å + infinitiv» (f.eks. «å rydde»); substantiv med riktig artikkel en/ei/et (f.eks. «en pause», «ei hylle», «et lager»); adjektiv uten artikkel.
- Kapitteltest: nøyaktig ${testAntall} oppgaver.
- Hvert ordliste-element MÅ ha feltene ord, forklaring og eksempel (alle tre obligatoriske).
- grammatikkForklaring MÅ finnes: lærebokaktig forklaring av «${kapittel.grammatikk}».
  Krav til forklaringen: presis og grammatisk korrekt; språk på ${kapittel.cefrNivaa} (A2–B1);
  forklar HVA det er, NÅR vi bruker det, og HVORDAN formen lages; minst 4–8 konkrete eksempelsetninger
  (gjerne knyttet til yrket ${kapittel.yrke}); kort huskeregel; ingen akademisk sjargong.
- Integrer grammatikk naturlig i tekster og oppgaver.
- IKKE lag hverdagsmatematikk her (kommer i eget kall). Utelat feltet hverdagsmatematikk.
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
  "grammatikkForklaring": {
    "tittel": "${kapittel.grammatikk}",
    "forklaring": "To til fire korte avsnitt som forklarer temaet klart for elever på A2–B1.",
    "eksempler": [
      "Eksempelsetning 1.",
      "Eksempelsetning 2.",
      "Eksempelsetning 3.",
      "Eksempelsetning 4."
    ],
    "huskeregel": "En kort, praktisk huskeregel."
  },
  "ordliste": [
    { "ord": "å rydde", "forklaring": "verb: gjøre rent / ordne", "eksempel": "Jeg liker å rydde på lageret." },
    { "ord": "et lager", "forklaring": "substantiv: sted der varer oppbevares", "eksempel": "Varene står på et lager." },
    { "ord": "en kollega", "forklaring": "substantiv: person du jobber med", "eksempel": "En kollega hjelper meg." }
  ],
  "kapitteltest": [{ "nummer": 1, "innhold": "string" }],
  "fasit": "string (norsk-delen)"
}`;

    const [norskSettled, matteSettled] = await Promise.allSettled([
      model.generateContent(norskPrompt),
      genererHverdagsmatematikkMedGemini(kapittel)
    ]);

    if (norskSettled.status === "rejected") {
      throw norskSettled.reason instanceof Error
        ? norskSettled.reason
        : new Error(String(norskSettled.reason));
    }

    const response = norskSettled.value;
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
    const parsed = JSON.parse(json) as Record<string, unknown>;
    // Matte genereres separat — ikke stol på evt. stub i norsk-JSON.
    delete parsed.hverdagsmatematikk;
    delete parsed.hverdagsregning;
    delete parsed.matematikk;

    const matteFromGemini =
      matteSettled.status === "fulfilled" ? matteSettled.value : null;
    if (!matteFromGemini) {
      console.warn("[gemini] Bruker konkrete reservedoppgaver for hverdagsmatematikk.");
    }
    parsed.hverdagsmatematikk =
      matteFromGemini ?? createConcreteFallbackHverdagsmatematikk(kapittel);

    const normalized = normalizeGeminiPayload(parsed, kapittel);
    const validated = arbeidshefteDataSchema.parse(normalized);
    return { data: validated, source: "gemini" };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[gemini] Feilet, bruker fallback:", errorMessage);
    // Prøv fortsatt eget matte-kall slik at regning ikke blir tom placeholder.
    const fallback = createFallbackArbeidshefte(kapittel);
    const matte = await genererHverdagsmatematikkMedGemini(kapittel);
    if (matte) {
      fallback.hverdagsmatematikk = matte;
    }
    return {
      data: fallback,
      source: "fallback",
      errorMessage
    };
  }
}
