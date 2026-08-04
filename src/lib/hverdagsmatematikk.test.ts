import { describe, expect, it } from "vitest";
import {
  MATTE_KATEGORI_LABEL,
  createConcreteFallbackHverdagsmatematikk,
  isPlaceholderMatte,
  matteKategoriForKapittel,
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

  it("lager konkrete reservedoppgaver uten placeholder-tekst", () => {
    const matte = createConcreteFallbackHverdagsmatematikk(sampleKapittel);
    expect(matte.niva1).toHaveLength(6);
    expect(matte.niva2).toHaveLength(6);
    expect(isPlaceholderMatte(matte)).toBe(false);
    expect(matte.niva1[0]!.innhold).toMatch(/M1a/);
    expect(matte.fasit).toMatch(/M1a/);
  });
});
