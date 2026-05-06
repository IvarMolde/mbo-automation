import type { Kapittel } from "./types.js";

const KAPITLER: Kapittel[] = [
  {
    nummer: 1,
    yrke: "Renholder",
    grammatikk: "Presens og preteritum",
    arbeidsnorskTema: "Arbeidsrutiner og hygiene",
    cefrNivaa: "A2"
  },
  {
    nummer: 2,
    yrke: "Helsefagarbeider",
    grammatikk: "Modalverb",
    arbeidsnorskTema: "Kommunikasjon med pasienter",
    cefrNivaa: "A2"
  },
  {
    nummer: 3,
    yrke: "Kokk",
    grammatikk: "Imperativ",
    arbeidsnorskTema: "Instruksjoner og matsikkerhet",
    cefrNivaa: "B1"
  }
];

export function getAllKapitler(): Kapittel[] {
  return KAPITLER;
}

export function getKapittel(nummer: number): Kapittel | undefined {
  return KAPITLER.find((k) => k.nummer === nummer);
}

export function getKapittelForUke(uke: number): Kapittel {
  const index = Math.abs(uke) % KAPITLER.length;
  return KAPITLER[index]!;
}
