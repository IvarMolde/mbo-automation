import type { CefrCanDo, CefrNivaa, Kapittel } from "./types.js";

const CEFR_A2 = {
  resepsjon: [
    "Kan forstå korte, enkle tekster om kjente arbeidsoppgaver.",
    "Kan finne konkret informasjon i enkle instruksjoner og skjema.",
    "Kan forstå hovedinnhold i korte meldinger med tydelig språk."
  ],
  samhandling: [
    "Kan delta i korte samtaler om kjente rutiner med støtte.",
    "Kan stille enkle oppklaringsspørsmål i arbeidssituasjoner.",
    "Kan svare hensiktsmessig på enkle beskjeder og forespørsler."
  ],
  produksjon: [
    "Kan beskrive enkle arbeidsoppgaver med korte setninger.",
    "Kan skrive korte, sammenhengende tekster om daglige rutiner.",
    "Kan gi enkle forklaringer på hva som skal gjøres og når."
  ]
} as const;

const CEFR_B1 = {
  resepsjon: [
    "Kan forstå hovedpunktene i klar, standard språkbruk om arbeid.",
    "Kan tolke informasjon i instrukser, rutiner og enkle rapporter.",
    "Kan følge begrunnelser når temaet er kjent og tydelig strukturert."
  ],
  samhandling: [
    "Kan håndtere de fleste samtaler som oppstår på arbeidsplassen.",
    "Kan be om og gi nærmere forklaringer ved misforståelser.",
    "Kan samarbeide muntlig om planlegging og problemløsing."
  ],
  produksjon: [
    "Kan skrive sammenhengende tekster om erfaringer og planer.",
    "Kan begrunne valg og foreslå løsninger i kjente situasjoner.",
    "Kan presentere et tema kort med tydelig struktur og formål."
  ]
} as const;

const KAPITLER: Kapittel[] = [
  { nummer: 1, yrke: "Renholder", grammatikk: "Presens og preteritum", arbeidsnorskTema: "Arbeidsrutiner og hygiene", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 2, yrke: "Helsefagarbeider", grammatikk: "Modalverb", arbeidsnorskTema: "Kommunikasjon med pasienter", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 3, yrke: "Kokk", grammatikk: "Imperativ", arbeidsnorskTema: "Instruksjoner og matsikkerhet", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 4, yrke: "Butikkmedarbeider", grammatikk: "Substantiv i entall/flertall", arbeidsnorskTema: "Kundeservice i butikk", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 5, yrke: "Lagerarbeider", grammatikk: "Preposisjoner", arbeidsnorskTema: "Plassering og logistikk", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 6, yrke: "Servitør", grammatikk: "Spørresetninger", arbeidsnorskTema: "Bestilling og service", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 7, yrke: "Barnehageassistent", grammatikk: "Adjektiv og samsvarsbøying", arbeidsnorskTema: "Daglige aktiviteter med barn", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 8, yrke: "Byggarbeider", grammatikk: "Imperativ og sikkerhetsspråk", arbeidsnorskTema: "HMS på byggeplass", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 9, yrke: "Sjåfør", grammatikk: "Tidsuttrykk", arbeidsnorskTema: "Ruteplan og levering", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 10, yrke: "Kontormedarbeider", grammatikk: "Bindeord", arbeidsnorskTema: "E-post og møtekommunikasjon", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 11, yrke: "Resepsjonist", grammatikk: "Høflighetsuttrykk", arbeidsnorskTema: "Mottak av besøkende", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 12, yrke: "Produksjonsmedarbeider", grammatikk: "Passiv form", arbeidsnorskTema: "Maskiner og kvalitet", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 13, yrke: "Elektrikerlærling", grammatikk: "Sammensatte setninger", arbeidsnorskTema: "Feilsøking og dokumentasjon", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 14, yrke: "Helseassistent", grammatikk: "Pronomen", arbeidsnorskTema: "Veiledning og omsorg", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 15, yrke: "Kafemedarbeider", grammatikk: "Modale hjelpeverb", arbeidsnorskTema: "Salg, hygiene og tempo", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 16, yrke: "Vaktmester", grammatikk: "Perfektum", arbeidsnorskTema: "Vedlikehold og avviksrapportering", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 17, yrke: "Frisørassistent", grammatikk: "Refleksive verb", arbeidsnorskTema: "Kundebehandling og anbefalinger", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 18, yrke: "Kjøkkenassistent", grammatikk: "Mengdeuttrykk", arbeidsnorskTema: "Forberedelser og samarbeid", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 19, yrke: "Pleiemedarbeider", grammatikk: "Sammenligning", arbeidsnorskTema: "Observasjon og rapportering", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 20, yrke: "Maler", grammatikk: "Fremtid og planer", arbeidsnorskTema: "Planlegging av oppdrag", cefrNivaa: "B1", cefrCanDo: CEFR_B1 },
  { nummer: 21, yrke: "Hotellmedarbeider", grammatikk: "Høflig indirekte språk", arbeidsnorskTema: "Gjestedialog og service", cefrNivaa: "A2", cefrCanDo: CEFR_A2 },
  { nummer: 22, yrke: "Hjemmetjenesteassistent", grammatikk: "Konjunksjoner og årsak", arbeidsnorskTema: "Samarbeid med brukere og kolleger", cefrNivaa: "B1", cefrCanDo: CEFR_B1 }
];

export function getAllKapitler(): Kapittel[] {
  return KAPITLER;
}

export function getKapittel(nummer: number): Kapittel | undefined {
  return KAPITLER.find((k) => k.nummer === nummer);
}

/** Modulo-fallback når årsplan ikke er tilgjengelig (utvikling / reserve). */
export function getKapittelForUkeModulo(uke: number): Kapittel {
  const index = (Math.abs(uke) - 1) % KAPITLER.length;
  return KAPITLER[index]!;
}

export function getCefrCanDoForNivaa(nivaa: CefrNivaa): CefrCanDo {
  const src = nivaa === "B1" ? CEFR_B1 : CEFR_A2;
  return {
    resepsjon: [...src.resepsjon],
    samhandling: [...src.samhandling],
    produksjon: [...src.produksjon]
  };
}
