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
- Nivå 1: nøyaktig 6 eller 7 oppgaver (bruk 6 eller 7). Enkle, konkrete, kjente situasjoner.
- Nivå 2: nøyaktig 6 eller 7 oppgaver. Samme situasjon/tallgrunnlag, men mer krevende regning.
- Varier oppgavetyper blant: ${typer}
- Marker deloppgaver som M1a, M1b … for nivå 1 og M2a, M2b … for nivå 2 (eget prefiks så det ikke kolliderer med norsk).
- Ingen kalkulator- eller regneark-oppgaver. Ingen barnslig tone.
- Focal læringsmål nivå 1 (bruk flere av disse):
${mal.niva1.map((m) => `  • ${m}`).join("\n")}
- Focal læringsmål nivå 2 (bruk flere av disse):
${mal.niva2.map((m) => `  • ${m}`).join("\n")}
- Feltet fasit: klare svar for alle lukkede regneoppgaver + korte eksempelsvar der det er åpent.
- niva1 og niva2 MÅ hver ha nøyaktig 6 eller 7 oppgaver (ikke færre).
`.trim();
}

/**
 * Brukbare reservedoppgaver med konkrete tall (ikke «erstattes av Gemini»).
 * Brukes når Gemini-matte mangler eller feiler.
 */
export function createConcreteFallbackHverdagsmatematikk(kapittel: Kapittel): HverdagsmatematikkData {
  const kategori = matteKategoriForKapittel(kapittel.nummer);
  const mal = velgUkemal(kategori, kapittel.nummer);
  const yrke = kapittel.yrke;
  const tema = kapittel.arbeidsnorskTema;
  const y = yrke.toLowerCase();

  const packs: Record<
    MatteKategori,
    {
      fagtekst: string;
      niva1: Oppgave[];
      niva2: Oppgave[];
      fasit: string;
    }
  > = {
    tall: {
      fagtekst:
        `Som ${y} planlegger du en vanlig dag knyttet til ${tema.toLowerCase()}. ` +
        `Før pause jobber du 4 timer, etter pause 3,5 timer. Arbeidsstedet har 12 rom. ` +
        `Halvparten av rommene er ferdige før lunsj. Du bruker 25 % av dagen på opplæring med en kollega. ` +
        `Rengjøringsmiddel koster 36 kroner per liter, og dere trenger 1,5 liter. ` +
        `Materiell til uka koster 240 kroner. En eske hansker koster 48 kroner, og dere kjøper 3 esker. ` +
        `Sjekkliste: 8 punkter er gjort, 4 gjenstår. Les tallene nøye — oppgavene bruker dem.`,
      niva1: [
        {
          nummer: 1,
          type: "les_og_finn_tall",
          tittel: "Finn tall i teksten",
          innhold:
            "M1a Hvor mange timer jobber du før pause? Skriv tallet.\n" +
            "M1b Hvor mange rom har arbeidsstedet?"
        },
        {
          nummer: 2,
          type: "regneoppgave",
          tittel: "Addisjon og halvparten",
          innhold:
            "M1c Hvor mange timer jobber du totalt denne dagen (før + etter pause)?\n" +
            "M1d Hvor mange rom er ferdige før lunsj?"
        },
        {
          nummer: 3,
          type: "flervalg",
          tittel: "Prosent",
          innhold:
            "M1e Du bruker 25 % av dagen på opplæring. Hvilket tall passer best?\n" +
            "A) 1/4 av dagen   B) 1/2 av dagen   C) 3/4 av dagen\nSkriv bokstav."
        },
        {
          nummer: 4,
          type: "fyll_inn",
          tittel: "Pris",
          innhold: "M1f Hva koster 1,5 liter rengjøringsmiddel når 1 liter koster 36 kroner? _____ kroner"
        },
        {
          nummer: 5,
          type: "overslag_vurder",
          tittel: "Overslag",
          innhold:
            "M1g Materiell koster 240 kroner. Er 250 kroner et greit overslag? Svar ja/nei og én setning om hvorfor."
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Sammenlikne",
          innhold:
            "M1h 8 punkter er gjort og 4 gjenstår. Er mer enn halvparten gjort? Svar ja/nei og begrunn kort."
        }
      ],
      niva2: [
        {
          nummer: 1,
          type: "regneoppgave",
          tittel: "Multiplikasjon",
          innhold: "M2a Hva koster 3 esker hansker à 48 kroner?"
        },
        {
          nummer: 2,
          type: "regneoppgave",
          tittel: "Desimaltall",
          innhold: "M2b Du jobber 7,5 timer. Hvor mange timer er det hvis du jobber dobbelt så lenge?"
        },
        {
          nummer: 3,
          type: "flervalg",
          tittel: "Brøk og prosent",
          innhold:
            "M2c 25 % er det samme som …\nA) 0,25 og 1/4   B) 0,5 og 1/2   C) 2,5 og 1/4\nSkriv bokstav."
        },
        {
          nummer: 4,
          type: "fyll_inn",
          tittel: "Budsjett",
          innhold:
            "M2d Materiell 240 kr + 1,5 L middel (36 kr/L) + 3 esker hansker (48 kr). Totalt: _____ kroner"
        },
        {
          nummer: 5,
          type: "tabell_eller_figur",
          tittel: "Enkel tabell",
          innhold:
            "M2e Lag en tabell med to kolonner (del / timer): før pause, etter pause, totalt. Fyll inn tallene fra teksten."
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Vurder svar",
          innhold:
            "M2f En kollega sier at halvparten av 12 rom er 5. Har kollegaen rett? Begrunn med regning."
        }
      ],
      fasit:
        "M1a 4 timer. M1b 12 rom. M1c 7,5 timer. M1d 6 rom. M1e A. M1f 54 kroner. " +
        "M1g Ja — 240 er nær 250. M1h Ja — 8 av 12 er mer enn halvparten. " +
        "M2a 144 kroner. M2b 15 timer. M2c A. M2d 240 + 54 + 144 = 438 kroner. " +
        "M2e før 4 / etter 3,5 / totalt 7,5. M2f Nei — halvparten av 12 er 6."
    },
    maling_geometri: {
      fagtekst:
        `Som ${y} måler du ofte flater og mengder i arbeidet med ${tema.toLowerCase()}. ` +
        `Et gulv er 5 m langt og 4 m bredt. Et vindu er 120 cm høyt. Pausevarighet er 30 minutter. ` +
        `En spann rommer 10 liter. Du heller oppi 2,5 liter konsentrat. Temperaturen inne er 21 °C. ` +
        `En rett vinkel er 90°. Et kvadratisk skilt er 40 cm på hver side. ` +
        `Du går 80 meter langs korridoren. Bruk tallene i oppgavene — uten kalkulator.`,
      niva1: [
        {
          nummer: 1,
          type: "les_og_finn_tall",
          tittel: "Finn mål",
          innhold: "M1a Hvor langt er gulvet? M1b Hvor mange liter rommer spannet?"
        },
        {
          nummer: 2,
          type: "regneoppgave",
          tittel: "Areal",
          innhold: "M1c Hva er arealet av gulvet (lengde × bredde) i m²?"
        },
        {
          nummer: 3,
          type: "fyll_inn",
          tittel: "Enheter",
          innhold: "M1d Vinduet er 120 cm. Hvor mange meter er det? _____ m"
        },
        {
          nummer: 4,
          type: "flervalg",
          tittel: "Volum",
          innhold:
            "M1e Du heller 2,5 L i et spann på 10 L. Hvor mye plass er ledig?\nA) 7,5 L  B) 12,5 L  C) 2,5 L"
        },
        {
          nummer: 5,
          type: "overslag_vurder",
          tittel: "Tid",
          innhold: "M1f Pausen er 30 minutter. Er det nærmere en halv time eller en hel time? Svar kort."
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Figur",
          innhold: "M1g Et skilt er kvadratisk. Hva betyr det for sidene? Én setning."
        }
      ],
      niva2: [
        {
          nummer: 1,
          type: "regneoppgave",
          tittel: "Omkrets",
          innhold: "M2a Hva er omkretsen av gulvet 5 m × 4 m?"
        },
        {
          nummer: 2,
          type: "regneoppgave",
          tittel: "Areal skilt",
          innhold: "M2b Arealet av skiltet 40 cm × 40 cm i cm²?"
        },
        {
          nummer: 3,
          type: "fyll_inn",
          tittel: "Omregning",
          innhold: "M2c 80 meter = _____ cm"
        },
        {
          nummer: 4,
          type: "flervalg",
          tittel: "Vinkel",
          innhold: "M2d En rett vinkel er …\nA) 45°  B) 90°  C) 180°"
        },
        {
          nummer: 5,
          type: "tabell_eller_figur",
          tittel: "Skisse",
          innhold: "M2e Tegn et rektangel 5×4 (ikke i målestokk). Merk lengde og bredde."
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Vurder",
          innhold: "M2f Er 21 °C typisk innetemperatur? Begrunn med én setning."
        }
      ],
      fasit:
        "M1a 5 m. M1b 10 L. M1c 20 m². M1d 1,2 m. M1e A. M1f Halv time. " +
        "M1g Alle sider er like lange. M2a 18 m. M2b 1600 cm². M2c 8000 cm. M2d B. " +
        "M2e Skisse med 5 og 4 merket. M2f Ja — vanlig romtemperatur rundt 20–22 °C."
    },
    statistikk: {
      fagtekst:
        `Som ${y} noterer dere tall om ${tema.toLowerCase()}. ` +
        `Mandag: 6 rom. Tirsdag: 8 rom. Onsdag: 5 rom. Torsdag: 9 rom. Fredag: 7 rom. ` +
        `Tre kolleger svarte på en kort spørreundersøkelse om pause: 10 min, 20 min og 15 min. ` +
        `På lageret teller dere esker: liten 4, middels 6, stor 2. ` +
        `Bruk tallene til tabell, søylediagram og gjennomsnitt — på papir, uten regneark.`,
      niva1: [
        {
          nummer: 1,
          type: "les_og_finn_tall",
          tittel: "Finn data",
          innhold: "M1a Hvor mange rom ble gjort tirsdag? M1b Hvor mange esker «middels»?"
        },
        {
          nummer: 2,
          type: "tabell_eller_figur",
          tittel: "Tabell",
          innhold: "M1c Lag en tabell: ukedag | antall rom for man–fre med tallene fra teksten."
        },
        {
          nummer: 3,
          type: "regneoppgave",
          tittel: "Opptelling",
          innhold: "M1d Hvor mange rom totalt man–fre?"
        },
        {
          nummer: 4,
          type: "flervalg",
          tittel: "Sammenlikne",
          innhold: "M1e Hvilken dag hadde flest rom?\nA) Mandag  B) Torsdag  C) Onsdag"
        },
        {
          nummer: 5,
          type: "fyll_inn",
          tittel: "Søyler",
          innhold: "M1f Tegn et enkelt søylediagram for man, tir og ons (antall rom)."
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Les diagram",
          innhold: "M1g Er tirsdag høyere enn onsdag i diagrammet ditt? Ja/nei og hvorfor."
        }
      ],
      niva2: [
        {
          nummer: 1,
          type: "regneoppgave",
          tittel: "Gjennomsnitt",
          innhold: "M2a Hva er gjennomsnittlig pausetid for de tre kollegene (10, 20 og 15 min)?"
        },
        {
          nummer: 2,
          type: "regneoppgave",
          tittel: "Gjennomsnitt rom",
          innhold: "M2b Gjennomsnittlig antall rom per dag man–fre?"
        },
        {
          nummer: 3,
          type: "tabell_eller_figur",
          tittel: "Esker",
          innhold: "M2c Lag tabell for esker (liten/middels/stor) og et søylediagram."
        },
        {
          nummer: 4,
          type: "flervalg",
          tittel: "Tolkning",
          innhold:
            "M2d Totalt antall esker er 12. Er «middels» halvparten av alle?\nA) Ja  B) Nei"
        },
        {
          nummer: 5,
          type: "fyll_inn",
          tittel: "Differanse",
          innhold: "M2e Hvor mange flere rom torsdag enn onsdag? _____"
        },
        {
          nummer: 6,
          type: "kort_begrunnelse",
          tittel: "Vurder data",
          innhold: "M2f Hvorfor er gjennomsnitt nyttig når dere planlegger uka? Én setning."
        }
      ],
      fasit:
        "M1a 8. M1b 6. M1c man 6, tir 8, ons 5, tor 9, fre 7. M1d 35. M1e B. " +
        "M1f Søyler 6/8/5. M1g Ja — 8 > 5. M2a 15 min. M2b 7. M2c tabell 4/6/2. M2d A (6 av 12). " +
        "M2e 4. M2f Det viser et typisk nivå for planlegging."
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
