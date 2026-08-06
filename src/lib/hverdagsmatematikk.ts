/**
 * Hverdagsmatematikk for MBO-ukeheftet.
 * Læringsmål: docs/hverdagsmatematikk-laringsmal.md
 */

import type { HverdagsmatematikkData, Kapittel, Oppgave } from "./types.js";

export type MatteKategori = "tall" | "maling_geometri" | "statistikk";

/** True når innholdet er den gamle/midlertidige placeholder-teksten. */
export function isPlaceholderMatte(matte: HverdagsmatematikkData): boolean {
  const blob = [
    matte.fagtekst,
    matte.fasit,
    ...matte.niva1.map((o) => o.innhold),
    ...matte.niva2.map((o) => o.innhold)
  ].join("\n");
  return /Midlertidig fallback|erstattes av Gemini/i.test(blob);
}

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
- Nivå 1: nøyaktig 6 oppgaver. Enkle, konkrete, kjente situasjoner.
- Nivå 2: nøyaktig 6 oppgaver. Samme situasjon/tallgrunnlag, men mer krevende regning.
- Hver oppgave har kort forklaring, deretter nøyaktig tre deloppgaver merket a. b. c. (punktum), hver på egen linje.
- Ikke bruk M1a/M2a — bruk samme merking som norsk: a. b. c.
- Varier oppgavetyper blant: ${typer}
- Ingen kalkulator- eller regneark-oppgaver. Ingen barnslig tone.
- Focal læringsmål nivå 1 (bruk flere av disse):
${mal.niva1.map((m) => `  • ${m}`).join("\n")}
- Focal læringsmål nivå 2 (bruk flere av disse):
${mal.niva2.map((m) => `  • ${m}`).join("\n")}
- Feltet fasit: svar merket «Oppgave 1: a. … b. … c. …» osv.
- niva1 og niva2 MÅ hver ha nøyaktig 6 oppgaver (ikke færre).
`.trim();
}

/**
 * Brukbare reservedoppgaver med konkrete tall (ikke «erstattes av Gemini»).
 * Hver oppgave har tre deloppgaver: a. b. c.
 */
export function createConcreteFallbackHverdagsmatematikk(kapittel: Kapittel): HverdagsmatematikkData {
  const kategori = matteKategoriForKapittel(kapittel.nummer);
  const mal = velgUkemal(kategori, kapittel.nummer);
  const yrke = kapittel.yrke;
  const tema = kapittel.arbeidsnorskTema;
  const y = yrke.toLowerCase();

  const oppgave = (
    nummer: number,
    type: string,
    tittel: string,
    intro: string,
    a: string,
    b: string,
    c: string
  ): Oppgave => ({
    nummer,
    type,
    tittel,
    innhold: `${intro}\na. ${a}\nb. ${b}\nc. ${c}`
  });

  const packs: Record<
    MatteKategori,
    { fagtekst: string; niva1: Oppgave[]; niva2: Oppgave[]; fasit: string }
  > = {
    tall: {
      fagtekst:
        `Som ${y} planlegger du en vanlig dag knyttet til ${tema.toLowerCase()}. ` +
        `Før pause jobber du 4 timer, etter pause 3,5 timer. Arbeidsstedet har 12 rom. ` +
        `Halvparten av rommene er ferdige før lunsj. Du bruker 25 % av dagen på opplæring. ` +
        `Rengjøringsmiddel koster 36 kroner per liter, og dere trenger 1,5 liter. ` +
        `Materiell til uka koster 240 kroner. En eske hansker koster 48 kroner, og dere kjøper 3 esker. ` +
        `Sjekkliste: 8 punkter er gjort, 4 gjenstår.`,
      niva1: [
        oppgave(1, "les_og_finn_tall", "Finn tall i teksten", "Les fagteksten og finn tallene.", "Hvor mange timer før pause?", "Hvor mange rom har arbeidsstedet?", "Hvor mange timer etter pause?"),
        oppgave(2, "regneoppgave", "Addisjon og halvparten", "Regn ut ut fra tallene i teksten.", "Totalt antall arbeidstimer (før + etter pause)?", "Hvor mange rom er ferdige før lunsj?", "Hvor mange rom gjenstår da?"),
        oppgave(3, "flervalg", "Prosent", "Kryss av for riktig svar.", "25 % av dagen er det samme som a) 1/4  b) 1/2  c) 3/4 — skriv bokstav for alternativet.", "Er 25 % mer enn 1/5? Ja eller nei.", "Skriv 25 % som desimaltall."),
        oppgave(4, "fyll_inn", "Pris og mengde", "Fyll inn svarene.", "Hva koster 1,5 liter når 1 liter koster 36 kroner?", "Hva koster 3 esker hansker à 48 kroner?", "Hva koster materiell + middel (1,5 L)?"),
        oppgave(5, "overslag_vurder", "Overslag", "Vurder tallene.", "Er 250 kroner et greit overslag for 240 kroner? Ja/nei.", "Avrund 3,5 timer til nærmeste hele time.", "Er 12 nærmere 10 eller 15?"),
        oppgave(6, "kort_begrunnelse", "Sammenlikne", "Svar kort og begrunn.", "Er mer enn halvparten av sjekklisten gjort (8 av 12)?", "Hvor mange punkter gjenstår?", "Hvorfor er det nyttig å telle ferdige punkter?")
      ],
      niva2: [
        oppgave(1, "regneoppgave", "Multiplikasjon og budsjett", "Regn nøyaktig.", "3 esker à 48 kroner = ?", "1,5 L à 36 kroner = ?", "240 + svarene over = totalt?"),
        oppgave(2, "regneoppgave", "Desimaltall", "Bruk desimaltall fra teksten.", "Dobbelt så lang arbeidsdag som 7,5 timer?", "Halvparten av 7,5 timer?", "7,5 − 3,5 = ?"),
        oppgave(3, "flervalg", "Brøk og prosent", "Kryss av riktig.", "25 % = ?  A) 0,25 og 1/4  B) 0,5 og 1/2  C) 2,5", "Halvparten av 12 er?  A) 5  B) 6  C) 7", "1,5 liter er det samme som?  A) 15/10 L  B) 3/2 L  C) begge"),
        oppgave(4, "fyll_inn", "Budsjett", "Fyll inn.", "Materiell: _____ kr", "Middel 1,5 L: _____ kr", "Hansker 3 esker: _____ kr"),
        oppgave(5, "tabell_eller_figur", "Enkel tabell", "Lag tabell på papir.", "Rad for «før pause» med timer", "Rad for «etter pause» med timer", "Rad for «totalt» med timer"),
        oppgave(6, "kort_begrunnelse", "Vurder svar", "Begrunn med regning.", "En kollega sier at halvparten av 12 er 5. Har kollegaen rett?", "Hva er riktig svar?", "Hvorfor er det viktig å sjekke overslag?")
      ],
      fasit:
        "Oppgave 1: a. 4 timer. b. 12 rom. c. 3,5 timer. " +
        "Oppgave 2: a. 7,5 timer. b. 6 rom. c. 6 rom. " +
        "Oppgave 3: a. a (1/4). b. Ja. c. 0,25. " +
        "Oppgave 4: a. 54 kr. b. 144 kr. c. 294 kr. " +
        "Oppgave 5: a. Ja. b. 4 timer. c. 10. " +
        "Oppgave 6: a. Ja. b. 4. c. For å planlegge resten av arbeidet. " +
        "Nivå 2 — Oppgave 1: a. 144. b. 54. c. 438. " +
        "Oppgave 2: a. 15. b. 3,75. c. 4. " +
        "Oppgave 3: a. A. b. B. c. C. " +
        "Oppgave 4: a. 240. b. 54. c. 144. " +
        "Oppgave 5: før 4 / etter 3,5 / totalt 7,5. " +
        "Oppgave 6: a. Nei. b. 6. c. For å unngå feil."
    },
    maling_geometri: {
      fagtekst:
        `Som ${y} måler du ofte flater og mengder i arbeidet med ${tema.toLowerCase()}. ` +
        `Et gulv er 5 m langt og 4 m bredt. Et vindu er 120 cm høyt. Pausen er 30 minutter. ` +
        `En spann rommer 10 liter. Du heller oppi 2,5 liter konsentrat. Temperaturen inne er 21 °C. ` +
        `En rett vinkel er 90°. Et kvadratisk skilt er 40 cm på hver side. Du går 80 meter langs korridoren.`,
      niva1: [
        oppgave(1, "les_og_finn_tall", "Finn mål", "Finn tallene i fagteksten.", "Hvor langt er gulvet?", "Hvor bredt er gulvet?", "Hvor mange liter rommer spannet?"),
        oppgave(2, "regneoppgave", "Areal og omkrets", "Regn ut.", "Areal av gulvet (lengde × bredde) i m²?", "Omkrets av gulvet?", "Areal av skiltet 40 cm × 40 cm i cm²?"),
        oppgave(3, "fyll_inn", "Enheter", "Fyll inn.", "120 cm = _____ m", "80 m = _____ cm", "30 minutter = _____ time (som brøk eller desimal)"),
        oppgave(4, "flervalg", "Volum", "Kryss av riktig.", "2,5 L i 10 L spann — ledig plass? A) 7,5 L B) 12,5 L C) 2,5 L", "Er 10 L mer enn 2,5 L? Ja/nei", "Hvor mye er helt fullt spann?"),
        oppgave(5, "overslag_vurder", "Tid og temperatur", "Vurder.", "Er pausen nærmere en halv eller en hel time?", "Er 21 °C typisk inne?", "Er 5 m × 4 m nærmere 20 m² eller 30 m²?"),
        oppgave(6, "kort_begrunnelse", "Figur", "Svar kort.", "Hva betyr det at skiltet er kvadratisk?", "Hvor stor er en rett vinkel?", "Hvorfor måler vi gulv før vi vasker?")
      ],
      niva2: [
        oppgave(1, "regneoppgave", "Omkrets og areal", "Regn nøyaktig.", "Omkrets 5 m × 4 m?", "Areal 5 m × 4 m?", "Areal skilt 40×40 cm?"),
        oppgave(2, "regneoppgave", "Omregning", "Regn om.", "80 m i cm?", "1,2 m i cm?", "2,5 L + 7,5 L = ?"),
        oppgave(3, "flervalg", "Vinkel", "Kryss av.", "Rett vinkel? A) 45° B) 90° C) 180°", "Har et kvadrat fire rette vinkler? Ja/nei", "Er 120 cm mer enn 1 m? Ja/nei"),
        oppgave(4, "fyll_inn", "Mål", "Fyll inn.", "Lengde: _____ m", "Bredde: _____ m", "Vinduhøyde: _____ cm"),
        oppgave(5, "tabell_eller_figur", "Skisse", "Tegn og merk.", "Tegn rektangel for gulvet", "Merk 5 m og 4 m", "Skriv arealet inni figuren"),
        oppgave(6, "kort_begrunnelse", "Vurder", "Begrunn.", "Hvorfor er omkrets nyttig på jobb?", "Når bruker du liter?", "Når bruker du grader (°)?")
      ],
      fasit:
        "Oppgave 1: a. 5 m. b. 4 m. c. 10 L. Oppgave 2: a. 20 m². b. 18 m. c. 1600 cm². " +
        "Oppgave 3: a. 1,2 m. b. 8000 cm. c. 0,5 time. Oppgave 4: a. A. b. Ja. c. 10 L. " +
        "Oppgave 5: a. Halv. b. Ja. c. 20 m². Oppgave 6: a. Like sider. b. 90°. c. For å planlegge arbeid. " +
        "Nivå 2 — Oppgave 1: a. 18 m. b. 20 m². c. 1600 cm². Oppgave 2: a. 8000 cm. b. 120 cm. c. 10 L. " +
        "Oppgave 3: a. B. b. Ja. c. Ja. Oppgave 4: a. 5. b. 4. c. 120. " +
        "Oppgave 5: skisse med mål. Oppgave 6: etter elevens begrunnelse."
    },
    statistikk: {
      fagtekst:
        `Som ${y} noterer dere tall om ${tema.toLowerCase()}. ` +
        `Mandag: 6 rom. Tirsdag: 8 rom. Onsdag: 5 rom. Torsdag: 9 rom. Fredag: 7 rom. ` +
        `Pauseundersøkelse: 10 min, 20 min og 15 min. Esker: liten 4, middels 6, stor 2.`,
      niva1: [
        oppgave(1, "les_og_finn_tall", "Finn data", "Finn tallene i teksten.", "Hvor mange rom tirsdag?", "Hvor mange esker «middels»?", "Hvor mange rom onsdag?"),
        oppgave(2, "tabell_eller_figur", "Tabell", "Lag tabell på papir.", "Skriv ukedagene man–fre", "Skriv antall rom for hver dag", "Hvilken dag har høyest tall?"),
        oppgave(3, "regneoppgave", "Opptelling", "Regn ut.", "Totalt antall rom man–fre?", "Differanse torsdag − onsdag?", "Sum esker (4+6+2)?"),
        oppgave(4, "flervalg", "Sammenlikne", "Kryss av.", "Flest rom? A) Mandag B) Torsdag C) Onsdag", "Er tirsdag høyere enn onsdag? Ja/nei", "Er middels flest esker? Ja/nei"),
        oppgave(5, "fyll_inn", "Søyler", "Tegn enkelt.", "Søyle for mandag (6)", "Søyle for tirsdag (8)", "Søyle for onsdag (5)"),
        oppgave(6, "kort_begrunnelse", "Les diagram", "Svar kort.", "Er tirsdag høyere enn onsdag i diagrammet?", "Hvorfor tegner vi søyler?", "Hva viser tallene for uka?")
      ],
      niva2: [
        oppgave(1, "regneoppgave", "Gjennomsnitt pause", "Regn ut.", "Sum 10+20+15?", "Gjennomsnitt av de tre?", "Er gjennomsnittet over 15? Ja/nei"),
        oppgave(2, "regneoppgave", "Gjennomsnitt rom", "Regn ut.", "Totalt man–fre?", "Gjennomsnitt per dag?", "Er gjennomsnittet nærmere 7 eller 8?"),
        oppgave(3, "tabell_eller_figur", "Esker", "Lag tabell og søyler.", "Rad liten = 4", "Rad middels = 6", "Rad stor = 2"),
        oppgave(4, "flervalg", "Tolkning", "Kryss av.", "Er middels halvparten av 12? A) Ja B) Nei", "Er stor færrest? Ja/nei", "Totalt esker? A) 10 B) 12 C) 14"),
        oppgave(5, "fyll_inn", "Differanse", "Fyll inn.", "Torsdag − onsdag = _____", "Tirsdag − mandag = _____", "Fredag − onsdag = _____"),
        oppgave(6, "kort_begrunnelse", "Vurder data", "Begrunn.", "Hvorfor er gjennomsnitt nyttig i planlegging?", "Når er tabell bedre enn bare liste?", "Hva kan tallene fortelle om arbeidsuka?")
      ],
      fasit:
        "Oppgave 1: a. 8. b. 6. c. 5. Oppgave 2: man 6 … fre 7; høyest torsdag. " +
        "Oppgave 3: a. 35. b. 4. c. 12. Oppgave 4: a. B. b. Ja. c. Ja. " +
        "Oppgave 5: søyler 6/8/5. Oppgave 6: a. Ja. b. For å sammenlikne. c. Arbeidsmengde. " +
        "Nivå 2 — Oppgave 1: a. 45. b. 15. c. Nei. Oppgave 2: a. 35. b. 7. c. 7. " +
        "Oppgave 3: 4/6/2. Oppgave 4: a. A. b. Ja. c. B. Oppgave 5: a. 4. b. 2. c. 2. " +
        "Oppgave 6: etter elevens begrunnelse."
    }
  };

  const pack = packs[kategori]!;
  return {
    kategori,
    kategoriLabel: MATTE_KATEGORI_LABEL[kategori],
    tittel: `Hverdagsregning: ${yrke} og ${tema}`,
    fagtekst: pack.fagtekst,
    malNiva1: mal.niva1,
    malNiva2: mal.niva2,
    niva1: pack.niva1,
    niva2: pack.niva2,
    fasit: pack.fasit
  };
}
