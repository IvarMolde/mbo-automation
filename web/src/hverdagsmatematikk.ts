/** Speiler backend-rotasjonen i src/lib/hverdagsmatematikk.ts (for oversikten). */

export type MatteKategori = "tall" | "maling_geometri" | "statistikk";

export const MATTE_KATEGORI_LABEL: Record<MatteKategori, string> = {
  tall: "Tall",
  maling_geometri: "Måling og geometri",
  statistikk: "Statistikk"
};

type MalMedTag = { mal: string; tag: string };

/** Roterer: Tall → Måling → Statistikk per kapittelnummer. */
export function matteKategoriForKapittel(kapittelNummer: number): MatteKategori {
  const order: MatteKategori[] = ["tall", "maling_geometri", "statistikk"];
  const idx = Math.max(0, kapittelNummer - 1) % order.length;
  return order[idx]!;
}

export function matteKategoriLabelForKapittel(kapittelNummer: number): string {
  return MATTE_KATEGORI_LABEL[matteKategoriForKapittel(kapittelNummer)];
}

const MAL_NIVA1: Record<MatteKategori, MalMedTag[]> = {
  tall: [
    { mal: "bruke posisjonssystemet for hele tall", tag: "Posisjonssystem" },
    { mal: "bruke enkel addisjon og subtraksjon i kjente sammenhenger", tag: "Addisjon/subtraksjon" },
    {
      mal: "bruke enkle prosenter (25 %, 50 %, 75 %, 100 %), desimaltall (0,25, 0,5, 1,5) og brøker (1/4, 1/3, 1/2)",
      tag: "Prosent"
    },
    { mal: "bruke overslagsregning med enkle tall og vurdere svar", tag: "Overslag" },
    { mal: "foreta opptelling og sammenlikne tall", tag: "Opptelling" },
    { mal: "doble og halvere hele tall", tag: "Dobling/halvering" }
  ],
  maling_geometri: [
    {
      mal: "bruke grunnleggende enheter for lengde, areal, volum, vekt, temperatur, tid og vinkler i konkrete situasjoner",
      tag: "Enheter"
    },
    {
      mal: "kjenne igjen og beskrive trekk ved enkle to- og tredimensjonale geometriske figurer",
      tag: "Geometri"
    },
    { mal: "lese enkle tabeller, bruksanvisninger og kart", tag: "Tabeller/kart" },
    { mal: "sjekke resultater og vurdere kostnader opp mot hverandre", tag: "Kostnader" }
  ],
  statistikk: [
    {
      mal: "samle, sortere, notere og illustrere data med tabeller og søylediagram, og kommentere illustrasjonene",
      tag: "Søylediagram"
    },
    { mal: "lese og forstå enkle diagrammer", tag: "Diagram" },
    { mal: "lage eller beskrive enkle diagrammer på papir (ikke regneark)", tag: "Lage diagram" }
  ]
};

const MAL_NIVA2: Record<MatteKategori, MalMedTag[]> = {
  tall: [
    {
      mal: "bruke addisjon, subtraksjon, multiplikasjon og divisjon med hele tall, desimaltall og enkle brøker",
      tag: "De fire regneartene"
    },
    { mal: "bruke den lille multiplikasjonstabellen i praktiske situasjoner", tag: "Multiplikasjon" },
    { mal: "multiplisere og dividere med 10 og 100", tag: "Gange/dele med 10/100" },
    { mal: "bruke posisjonssystemet for desimaltall", tag: "Desimaltall" },
    { mal: "sammenlikne enkle brøker og desimaltall", tag: "Brøk" },
    {
      mal: "beskrive sammenhengen mellom brøker, prosenttall og desimaltall",
      tag: "Brøk/prosent/desimal"
    },
    { mal: "foreta enkel prosentregning og bruke avrundingsregler", tag: "Prosentregning" }
  ],
  maling_geometri: [
    { mal: "foreta enkel omregning av enheter for lengde, areal, volum, vekt og tid", tag: "Omregning" },
    { mal: "regne ut omkrets og areal av enkle geometriske figurer", tag: "Omkrets/areal" },
    { mal: "forklare problemstillinger med skisser og eksempler", tag: "Skisser" },
    {
      mal: "anvende informasjon i bruksanvisning eller arbeidstegning",
      tag: "Bruksanvisning"
    },
    { mal: "bekrefte resultater ved overslagsregning", tag: "Overslag" },
    {
      mal: "bruke målestokk, lese koordinatsystem, regne med fart eller valuta",
      tag: "Målestokk"
    }
  ],
  statistikk: [
    { mal: "lese og tolke tabeller, diagrammer og grafer", tag: "Tolke diagram" },
    { mal: "regne ut gjennomsnitt for et enkelt tallmateriale", tag: "Gjennomsnitt" },
    {
      mal: "systematisere og presentere tallmateriale i tabell/figur på papir",
      tag: "Presentere data"
    }
  ]
};

function takeEntries(list: MalMedTag[], n: number, offset: number): MalMedTag[] {
  if (list.length <= n) return [...list];
  const start = offset % list.length;
  const out: MalMedTag[] = [];
  for (let i = 0; i < n; i++) {
    out.push(list[(start + i) % list.length]!);
  }
  return out;
}

/** Korte tematagger for uka (fra læringsmålene), unike. */
export function matteTemataggerForKapittel(kapittelNummer: number): string[] {
  const kategori = matteKategoriForKapittel(kapittelNummer);
  const offset = Math.max(0, kapittelNummer - 1);
  const niva1 = takeEntries(MAL_NIVA1[kategori], 4, offset);
  const niva2 = takeEntries(MAL_NIVA2[kategori], 4, offset + 1);
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const e of [...niva1, ...niva2]) {
    if (seen.has(e.tag)) continue;
    seen.add(e.tag);
    tags.push(e.tag);
  }
  return tags;
}

/** Kort linje: «Tall · Prosent, Overslag, Opptelling». */
export function matteRegningKortLinje(kapittelNummer: number): string {
  const kategori = matteKategoriLabelForKapittel(kapittelNummer);
  const tagger = matteTemataggerForKapittel(kapittelNummer);
  if (!tagger.length) return kategori;
  return `${kategori} · ${tagger.join(", ")}`;
}
