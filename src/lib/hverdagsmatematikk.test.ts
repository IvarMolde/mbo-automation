import { describe, expect, it } from "vitest";
import {
  MATTE_KATEGORI_LABEL,
  createConcreteFallbackHverdagsmatematikk,
  isPlaceholderMatte,
  matteKategoriForKapittel,
  matteRegningKortLinje,
  matteTemataggerForKapittel,
  velgUkemal
} from "./hverdagsmatematikk.js";
import type { Kapittel } from "./types.js";

const sampleKapittel: Kapittel = {
  nummer: 1,
  yrke: "Renholder",
  grammatikk: "Presens",
  arbeidsnorskTema: "Hygiene",
  cefrNivaa: "A2",
  cefrCanDo: { resepsjon: ["r"], samhandling: ["s"], produksjon: ["p"] }
};

describe("hverdagsmatematikk", () => {
  it("roterer kategori per kapittel", () => {
    expect(matteKategoriForKapittel(1)).toBe("tall");
    expect(matteKategoriForKapittel(2)).toBe("maling_geometri");
    expect(matteKategoriForKapittel(3)).toBe("statistikk");
    expect(matteKategoriForKapittel(4)).toBe("tall");
    expect(MATTE_KATEGORI_LABEL.tall).toBe("Tall");
  });

  it("velger et utvalg læringsmål for uka", () => {
    const mal = velgUkemal("tall", 1);
    expect(mal.niva1.length).toBeGreaterThanOrEqual(3);
    expect(mal.niva2.length).toBeGreaterThanOrEqual(3);
    expect(mal.niva1[0]).toMatch(/posisjonssystemet|addisjon|prosent/i);
  });

  it("gir korte tematagger for oversikten", () => {
    expect(matteTemataggerForKapittel(1)).toContain("Posisjonssystem");
    expect(matteRegningKortLinje(1)).toMatch(/^Tall · /);
    expect(matteRegningKortLinje(2)).toMatch(/^Måling og geometri · /);
    expect(matteTemataggerForKapittel(2).some((t) => /Enheter|Geometri|Omkrets|Omregning/i.test(t))).toBe(true);
  });

  it("lager konkrete reservedoppgaver uten placeholder-tekst", () => {
    const matte = createConcreteFallbackHverdagsmatematikk(sampleKapittel);
    expect(matte.niva1).toHaveLength(6);
    expect(matte.niva2).toHaveLength(6);
    expect(isPlaceholderMatte(matte)).toBe(false);
    expect(matte.niva1[0]!.innhold).toMatch(/\na\. /);
    expect(matte.niva1[0]!.innhold).toMatch(/\nb\. /);
    expect(matte.niva1[0]!.innhold).toMatch(/\nc\. /);
    expect(matte.fasit).toMatch(/Oppgave 1:/);
  });
});
