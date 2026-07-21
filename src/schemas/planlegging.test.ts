import { describe, expect, it } from "vitest";
import { getAllKapitler } from "../lib/parser.js";
import {
  arbeidshefteDataSchema,
  generertUndervisningsoppleggSchema,
  kapittelSchema,
  presentasjonDataSchema
} from "./planlegging.js";

function sampleArbeidshefte() {
  return {
    tekstSeksjoner: Array.from({ length: 3 }, (_, si) => ({
      nummer: si + 1,
      type: "lareverk",
      tittel: `Tekst ${si + 1} tittel`,
      tekst: "a".repeat(40),
      oppgaver: Array.from({ length: 3 }, (_, oi) => ({
        nummer: oi + 1,
        type: "leseforstaelse",
        tittel: `Oppgave ${oi + 1}`,
        innhold: "a".repeat(15)
      }))
    })),
    ordliste: Array.from({ length: 15 }, (_, i) => ({
      ord: `ord${i}`,
      forklaring: "fork",
      eksempel: "eksempel setning"
    })),
    kapitteltest: Array.from({ length: 5 }, (_, i) => ({
      nummer: i + 1,
      innhold: "a".repeat(10)
    })),
    fasit: "a".repeat(20),
    presentasjonTekst: "a".repeat(20)
  };
}

describe("planlegging schemas", () => {
  it("validerer alle hardkodede kapitler fra parser", () => {
    for (const k of getAllKapitler()) {
      expect(() => kapittelSchema.parse(k)).not.toThrow();
    }
  });

  it("aksepterer minimalt gyldig arbeidshefte (Gemini-kontrakt)", () => {
    const parsed = arbeidshefteDataSchema.safeParse(sampleArbeidshefte());
    expect(parsed.success).toBe(true);
  });

  it("aksepterer generertUndervisningsopplegg med arbeidshefte + presentasjon", () => {
    const arbeidshefte = sampleArbeidshefte();
    const presentasjon = {
      slides: [
        { tittel: "S1", innhold: "Innhold" },
        { tittel: "S2", innhold: "Mer" }
      ]
    };
    expect(
      generertUndervisningsoppleggSchema.safeParse({ arbeidshefte, presentasjon }).success
    ).toBe(true);
  });

  it("validerer presentasjonDataSchema", () => {
    const p = presentasjonDataSchema.parse({
      slides: [{ tittel: "A", innhold: "B" }]
    });
    expect(p.slides).toHaveLength(1);
  });
});
