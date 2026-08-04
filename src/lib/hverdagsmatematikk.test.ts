import { describe, expect, it } from "vitest";
import {
  MATTE_KATEGORI_LABEL,
  matteKategoriForKapittel,
  velgUkemal
} from "./hverdagsmatematikk.js";

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
});
