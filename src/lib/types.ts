export type CefrNivaa = "A2" | "B1";

export interface Kapittel {
  nummer: number;
  yrke: string;
  grammatikk: string;
  arbeidsnorskTema: string;
  cefrNivaa: CefrNivaa;
}

export interface Lesetekst {
  tittel: string;
  tekst: string;
}

export interface OrdlisteOrd {
  ord: string;
  forklaring: string;
  eksempel: string;
}

export interface Oppgave {
  tittel: string;
  innhold: string;
}

export interface ArbeidshefteData {
  lesetekster: Lesetekst[];
  ordliste: OrdlisteOrd[];
  oppgaver: Oppgave[];
  presentasjonTekst: string;
}

export interface PresentasjonData {
  slides: Array<{
    tittel: string;
    innhold: string;
  }>;
}
