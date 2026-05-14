import { describe, expect, it } from "vitest";
import { getAllKapitler } from "../lib/parser.js";
import {
  arbeidshefteDataSchema,
  generertUndervisningsoppleggSchema,
  kapittelSchema,
  presentasjonDataSchema
} from "./planlegging.js";

describe("planlegging schemas", () => {
  it("validerer alle hardkodede kapitler fra parser", () => {
    for (const k of getAllKapitler()) {
      expect(() => kapittelSchema.parse(k)).not.toThrow();
    }
  });

  it("aksepterer minimalt gyldig arbeidshefte (Gemini-kontrakt)", () => {
    const raw = {
      lesetekster: [{ tittel: "Tittel", tekst: "a".repeat(40) }],
      ordliste: Array.from({ length: 8 }, (_, i) => ({
        ord: `ord${i}`,
        forklaring: "fork",
        eksempel: "eksempel setning"
      })),
      oppgaver: Array.from({ length: 4 }, (_, i) => ({
        tittel: `Oppgave ${i}`,
        innhold: "a".repeat(15)
      })),
      presentasjonTekst: "a".repeat(20)
    };
    const parsed = arbeidshefteDataSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  it("aksepterer generertUndervisningsopplegg med arbeidshefte + presentasjon", () => {
    const arbeidshefte = {
      lesetekster: [{ tittel: "Tittel", tekst: "a".repeat(40) }],
      ordliste: Array.from({ length: 8 }, (_, i) => ({
        ord: `ord${i}`,
        forklaring: "fork",
        eksempel: "eksempel setning"
      })),
      oppgaver: Array.from({ length: 4 }, (_, i) => ({
        tittel: `Oppgave ${i}`,
        innhold: "a".repeat(15)
      })),
      presentasjonTekst: "a".repeat(20)
    };
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
