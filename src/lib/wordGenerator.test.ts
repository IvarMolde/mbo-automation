import { describe, expect, it } from "vitest";
import { genererWordHefte, splitOppgaveInnhold } from "./wordGenerator.js";
import type { ArbeidshefteData, Kapittel } from "./types.js";

const kapittel: Kapittel = {
  nummer: 1,
  yrke: "Renholder",
  grammatikk: "Personlige pronomen",
  arbeidsnorskTema: "Personlige egenskaper",
  cefrNivaa: "A2",
  cefrCanDo: {
    resepsjon: ["Kan forstå korte tekster om arbeid."],
    samhandling: ["Kan delta i enkle samtaler."],
    produksjon: ["Kan skrive korte setninger om rutiner."]
  },
  periodeFokus: "Oppstart"
};

const hefte: ArbeidshefteData = {
  tekstSeksjoner: [
    {
      nummer: 1,
      type: "lareverk",
      tittel: "Vi blir kjent",
      tekst: "a".repeat(50),
      oppgaver: [
        {
          nummer: 1,
          type: "leseforstaelse",
          tittel: "Les og svar",
          innhold: "Hva er hovedtema? a) Hygiene b) Mat c) Sport d) Musikk e) Reise"
        },
        {
          nummer: 2,
          type: "skriveoppgave",
          tittel: "Skriv",
          innhold: "Skriv fem setninger om deg selv."
        }
      ]
    }
  ],
  grammatikkForklaring: {
    tittel: "Personlige pronomen",
    forklaring:
      "Personlige pronomen er små ord som erstatter navn. Vi bruker dem for å unngå å gjenta samme navn. " +
      "Formen endrer seg når ordet er subjekt eller objekt i setningen.",
    eksempler: [
      "Jeg jobber som renholder.",
      "Han hjelper meg i dag.",
      "Vi vasker gulvet sammen.",
      "Kan du hjelpe oss?"
    ],
    huskeregel: "Subjekt: jeg/du/han. Objekt: meg/deg/ham."
  },
  ordliste: Array.from({ length: 3 }, (_, i) => ({
    ord: `ord${i}`,
    forklaring: "forklaring",
    eksempel: "Dette er et eksempel."
  })),
  kapitteltest: [{ nummer: 1, innhold: "Hva betyr hygiene?" }],
  fasit: "a".repeat(30),
  hverdagsmatematikk: {
    kategori: "tall",
    kategoriLabel: "Tall",
    tittel: "Regning på jobb som renholder",
    fagtekst: "a".repeat(90),
    malNiva1: ["bruke enkel addisjon"],
    malNiva2: ["bruke multiplikasjon i praktiske situasjoner"],
    niva1: Array.from({ length: 6 }, (_, i) => ({
      nummer: i + 1,
      type: "regneoppgave",
      tittel: `N1-${i + 1}`,
      innhold: "Regn ut.\na. Første spørsmål.\nb. Andre spørsmål.\nc. Tredje spørsmål."
    })),
    niva2: Array.from({ length: 6 }, (_, i) => ({
      nummer: i + 1,
      type: "regneoppgave",
      tittel: `N2-${i + 1}`,
      innhold: "Regn ut.\na. Første spørsmål.\nb. Andre spørsmål.\nc. Tredje spørsmål."
    })),
    fasit: "b".repeat(30)
  }
};

describe("splitOppgaveInnhold", () => {
  it("splitter a-e til egne linjer med punktum", () => {
    const lines = splitOppgaveInnhold("Hva er tema? a) Hygiene b) Mat c) Sport d) Musikk e) Reise");
    expect(lines[0]).toMatch(/Hva er tema/);
    expect(lines).toContain("a. Hygiene");
    expect(lines).toContain("b. Mat");
    expect(lines).toContain("e. Reise");
  });

  it("normaliserer 1a/M1a til a. b. c.", () => {
    const lines1 = splitOppgaveInnhold("Hva er tema? a) Hygiene b) Mat c) Sport d) Musikk", 1);
    expect(lines1).toContain("a. Hygiene");
    expect(lines1).toContain("b. Mat");
    expect(lines1).toContain("d. Musikk");

    const lines2 = splitOppgaveInnhold("Velg riktig. 2a) Ja 2b) Nei 2c) Vet ikke", 2);
    expect(lines2).toContain("a. Ja");
    expect(lines2).toContain("b. Nei");
    expect(lines2).toContain("c. Vet ikke");

    const lines3 = splitOppgaveInnhold("M1a Fire timer. M1b Tolv rom. M1c Sju komma fem.");
    expect(lines3).toContain("a. Fire timer.");
    expect(lines3).toContain("b. Tolv rom.");
    expect(lines3).toContain("c. Sju komma fem.");
  });
});

describe("wordGenerator", () => {
  it("bygger et gyldig docx-buffer med designmal", async () => {
    const buf = await genererWordHefte(kapittel, hefte, 34);
    expect(buf.byteLength).toBeGreaterThan(2000);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
