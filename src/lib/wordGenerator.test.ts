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
  ordliste: Array.from({ length: 3 }, (_, i) => ({
    ord: `ord${i}`,
    forklaring: "forklaring",
    eksempel: "Dette er et eksempel."
  })),
  kapitteltest: [{ nummer: 1, innhold: "Hva betyr hygiene?" }],
  fasit: "a".repeat(30)
};

describe("splitOppgaveInnhold", () => {
  it("splitter a-e til egne linjer", () => {
    const lines = splitOppgaveInnhold("Hva er tema? a) Hygiene b) Mat c) Sport d) Musikk e) Reise");
    expect(lines[0]).toMatch(/Hva er tema/);
    expect(lines).toContain("a) Hygiene");
    expect(lines).toContain("b) Mat");
    expect(lines).toContain("e) Reise");
  });
});

describe("wordGenerator", () => {
  it("bygger et gyldig docx-buffer med designmal", async () => {
    const buf = await genererWordHefte(kapittel, hefte, 34);
    expect(buf.byteLength).toBeGreaterThan(2000);
    expect(buf.subarray(0, 2).toString("utf8")).toBe("PK");
  });
});
