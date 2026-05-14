import { describe, expect, it } from "vitest";
import { getAllKapitler, getKapittel, getKapittelForUkeModulo } from "./parser.js";

describe("parser", () => {
  it("contains 22 chapters", () => {
    const kapitler = getAllKapitler();
    expect(kapitler).toHaveLength(22);
    expect(kapitler[0]?.nummer).toBe(1);
    expect(kapitler[21]?.nummer).toBe(22);
  });

  it("resolves chapter by number", () => {
    const kapittel = getKapittel(10);
    expect(kapittel?.yrke).toBe("Kontormedarbeider");
    expect(kapittel?.cefrNivaa).toBe("B1");
  });

  it("maps week to chapter deterministically (modulo-reserve)", () => {
    expect(getKapittelForUkeModulo(1).nummer).toBe(1);
    expect(getKapittelForUkeModulo(22).nummer).toBe(22);
    expect(getKapittelForUkeModulo(23).nummer).toBe(1);
  });

  it("includes CEFR can-do descriptors", () => {
    const kapittel = getKapittel(3);
    expect(kapittel?.cefrCanDo.resepsjon.length).toBeGreaterThan(0);
    expect(kapittel?.cefrCanDo.samhandling.length).toBeGreaterThan(0);
    expect(kapittel?.cefrCanDo.produksjon.length).toBeGreaterThan(0);
  });
});
