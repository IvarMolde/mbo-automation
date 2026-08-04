/** Speiler backend-rotasjonen i src/lib/hverdagsmatematikk.ts (for oversikten). */

export type MatteKategori = "tall" | "maling_geometri" | "statistikk";

export const MATTE_KATEGORI_LABEL: Record<MatteKategori, string> = {
  tall: "Tall",
  maling_geometri: "Måling og geometri",
  statistikk: "Statistikk"
};

/** Roterer: Tall → Måling → Statistikk per kapittelnummer. */
export function matteKategoriForKapittel(kapittelNummer: number): MatteKategori {
  const order: MatteKategori[] = ["tall", "maling_geometri", "statistikk"];
  const idx = Math.max(0, kapittelNummer - 1) % order.length;
  return order[idx]!;
}

export function matteKategoriLabelForKapittel(kapittelNummer: number): string {
  return MATTE_KATEGORI_LABEL[matteKategoriForKapittel(kapittelNummer)];
}
