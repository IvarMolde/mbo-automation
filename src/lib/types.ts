export type CefrNivaa = "A2" | "B1";

export interface CefrCanDo {
  resepsjon: readonly string[];
  samhandling: readonly string[];
  produksjon: readonly string[];
}

/** Tematekst-mal fra årsplanen (tittel/type Gemini skal følge). */
export interface TematekstMal {
  nummer: number;
  tittel: string;
  type: string;
}

/** Oppgavetype-mal som skal brukes under hver tematekst. */
export interface OppgaveMal {
  nummer: number;
  type: string;
  beskrivelse: string;
}

export interface Kapittel {
  nummer: number;
  yrke: string;
  grammatikk: string;
  arbeidsnorskTema: string;
  cefrNivaa: CefrNivaa;
  cefrCanDo: CefrCanDo;
  /** Fra årsplan – brukes i Gemini-prompt og Word-struktur. */
  periodeFokus?: string;
  tematekster?: TematekstMal[];
  oppgavestruktur?: OppgaveMal[];
  ordlisteAntall?: number;
  kapitteltestAntall?: number;
  fasitInstruks?: string;
}

export interface Oppgave {
  nummer: number;
  type: string;
  tittel: string;
  innhold: string;
}

/** Én tematekst + tilhørende oppgaver (årsplan-struktur). */
export interface TekstSeksjon {
  nummer: number;
  type: string;
  tittel: string;
  tekst: string;
  oppgaver: Oppgave[];
}

export interface OrdlisteOrd {
  ord: string;
  forklaring: string;
  eksempel: string;
}

export interface KapitteltestOppgave {
  nummer: number;
  innhold: string;
}

export interface ArbeidshefteData {
  tekstSeksjoner: TekstSeksjon[];
  ordliste: OrdlisteOrd[];
  kapitteltest: KapitteltestOppgave[];
  fasit: string;
}
