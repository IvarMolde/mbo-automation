/**
 * Hverdagsmatematikk for MBO-ukeheftet.
 * Læringsmål: docs/hverdagsmatematikk-laringsmal.md
 */

export type MatteKategori = "tall" | "maling_geometri" | "statistikk";

export const MATTE_KATEGORI_LABEL: Record<MatteKategori, string> = {
  tall: "Tall",
  maling_geometri: "Måling og geometri",
  statistikk: "Statistikk"
};

/** Roterer hovedkategori per kapittel: Tall → Måling → Statistikk. */
export function matteKategoriForKapittel(kapittelNummer: number): MatteKategori {
  const order: MatteKategori[] = ["tall", "maling_geometri", "statistikk"];
  const idx = Math.max(0, kapittelNummer - 1) % order.length;
  return order[idx]!;
}

/** Utvalgte mål for uka (ikke hele katalogen) — brukes i Gemini-prompt. */
const MAL_NIVA1: Record<MatteKategori, string[]> = {
  tall: [
    "bruke posisjonssystemet for hele tall",
    "bruke enkel addisjon og subtraksjon i kjente sammenhenger",
    "bruke enkle prosenter (25 %, 50 %, 75 %, 100 %), desimaltall (0,25, 0,5, 1,5) og brøker (1/4, 1/3, 1/2)",
    "bruke overslagsregning med enkle tall og vurdere svar",
    "foreta opptelling og sammenlikne tall",
    "doble og halvere hele tall"
  ],
  maling_geometri: [
    "bruke grunnleggende enheter for lengde, areal, volum, vekt, temperatur, tid og vinkler i konkrete situasjoner",
    "kjenne igjen og beskrive trekk ved enkle to- og tredimensjonale geometriske figurer",
    "lese enkle tabeller, bruksanvisninger og kart",
    "sjekke resultater og vurdere kostnader opp mot hverandre"
  ],
  statistikk: [
    "samle, sortere, notere og illustrere data med tabeller og søylediagram, og kommentere illustrasjonene",
    "lese og forstå enkle diagrammer",
    "lage eller beskrive enkle diagrammer på papir (ikke regneark)"
  ]
};

const MAL_NIVA2: Record<MatteKategori, string[]> = {
  tall: [
    "bruke addisjon, subtraksjon, multiplikasjon og divisjon med hele tall, desimaltall og enkle brøker",
    "bruke den lille multiplikasjonstabellen i praktiske situasjoner",
    "multiplisere og dividere med 10 og 100",
    "bruke posisjonssystemet for desimaltall",
    "sammenlikne enkle brøker og desimaltall",
    "beskrive sammenhengen mellom brøker, prosenttall og desimaltall",
    "foreta enkel prosentregning og bruke avrundingsregler"
  ],
  maling_geometri: [
    "foreta enkel omregning av enheter for lengde, areal, volum, vekt og tid",
    "regne ut omkrets og areal av enkle geometriske figurer",
    "forklare problemstillinger med skisser og eksempler",
    "anvende informasjon i bruksanvisning eller arbeidstegning",
    "bekrefte resultater ved overslagsregning",
    "bruke målestokk, lese koordinatsystem, regne med fart eller valuta"
  ],
  statistikk: [
    "lese og tolke tabeller, diagrammer og grafer",
    "regne ut gjennomsnitt for et enkelt tallmateriale",
    "systematisere og presentere tallmateriale i tabell/figur på papir"
  ]
};

/** Velg 3–4 mål per nivå for ukas prompt (varierer litt med kapittel). */
export function velgUkemal(
  kategori: MatteKategori,
  kapittelNummer: number
): { niva1: string[]; niva2: string[] } {
  const take = (list: string[], n: number, offset: number): string[] => {
    if (list.length <= n) return [...list];
    const start = offset % list.length;
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      out.push(list[(start + i) % list.length]!);
    }
    return out;
  };
  const offset = Math.max(0, kapittelNummer - 1);
  return {
    niva1: take(MAL_NIVA1[kategori], 4, offset),
    niva2: take(MAL_NIVA2[kategori], 4, offset + 1)
  };
}

export const MATTE_OPPGAVETYPER = [
  "les_og_finn_tall",
  "regneoppgave",
  "flervalg",
  "fyll_inn",
  "overslag_vurder",
  "tabell_eller_figur",
  "kort_begrunnelse"
] as const;

export function buildMattePromptBlock(kapittelNummer: number, yrke: string, tema: string): string {
  const kategori = matteKategoriForKapittel(kapittelNummer);
  const label = MATTE_KATEGORI_LABEL[kategori];
  const mal = velgUkemal(kategori, kapittelNummer);
  const typer = MATTE_OPPGAVETYPER.join(", ");

  return `
HVERDAGSMATEMATIKK (obligatorisk del av heftet — voksne elever i MBO):
- Hovedkategori denne uken: ${label} (${kategori})
- Samme kontekst som norsk: yrke «${yrke}», tema «${tema}»
- Lag objektet «hverdagsmatematikk» i JSON
- Én fagtekst (80–150 ord) på enkelt bokmål for voksne: realistisk arbeid/hverdag med tall.
  Teksten skal GI DATA elevene trenger til oppgavene (priser, mengder, tider, mål, tabellverdier osv.).
- Velg innfallsvinkel innen ${label} — ikke bland inn andre hovedkategorier som hovedfokus.
- Nivå 1: nøyaktig 6 eller 7 oppgaver (bruk 6 eller 7). Enkle, konkrete, kjente situasjoner.
- Nivå 2: nøyaktig 6 eller 7 oppgaver. Samme situasjon/tallgrunnlag, men mer krevende regning.
- Varier oppgavetyper blant: ${typer}
- Marker deloppgaver som M1a, M1b … for nivå 1 og M2a, M2b … for nivå 2 (eget prefiks så det ikke kolliderer med norsk).
- Ingen kalkulator- eller regneark-oppgaver. Ingen barnslig tone.
- Focal læringsmål nivå 1 (bruk flere av disse):
${mal.niva1.map((m) => `  • ${m}`).join("\n")}
- Focal læringsmål nivå 2 (bruk flere av disse):
${mal.niva2.map((m) => `  • ${m}`).join("\n")}
- Feltet fasitMatematikk: klare svar for alle lukkede regneoppgaver + korte eksempelsvar der det er åpent.
`.trim();
}
