export type ViewId = "oversikt" | "denne-uken" | "perioder" | "om";

export interface ArsplanMetadata {
  tittel: string;
  kurs?: string;
  organisasjon?: string;
  samarbeidspartner?: string;
  skolear?: string;
  periode?: string;
  malgruppe?: string;
  norskniva?: string[];
  antallKapitler?: number;
  notat?: string;
}

export interface ArsplanPeriode {
  maned: string;
  ukeStart: number;
  ukeSlutt: number;
  uker: number[];
  kapitler: number[];
  fokus: string;
}

export interface ArsplanUkeOppslag {
  uke: number;
  kapittel: number;
  maned: string;
  periodeFokus: string;
}

export interface Tematekst {
  nummer: number;
  tittel: string;
  type: string;
}

export interface OppgaveMal {
  nummer: number;
  type: string;
  beskrivelse: string;
}

export interface ArsplanKapittel {
  nummer: number;
  tittel: string;
  maned: string;
  ukeStart: number;
  ukeSlutt: number;
  uker: number[];
  periodeFokus: string;
  cefrNivaa: string[];
  standardNiva?: string;
  grammatikk: string;
  yrke: string;
  arbeidsnorskTema?: string;
  tematekster?: Tematekst[];
  oppgavestruktur?: OppgaveMal[];
  ordliste?: { antall?: number; beskrivelse?: string };
  kapitteltest?: {
    antallOppgaver?: number;
    poengPerOppgave?: number;
    totalPoeng?: number;
  };
  fasit?: string;
}

export interface ArsplanDokument {
  metadata: ArsplanMetadata;
  perioder: ArsplanPeriode[];
  uker: ArsplanUkeOppslag[];
  kapitler: ArsplanKapittel[];
}

export interface UkeVisning {
  uke: number;
  maned: string;
  periodeFokus: string;
  kapittel: ArsplanKapittel | null;
  erDagensUke: boolean;
}
