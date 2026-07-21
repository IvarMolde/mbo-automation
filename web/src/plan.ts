import type { ArsplanDokument, ArsplanKapittel, UkeVisning } from "./types";
import { getIsoWeekNumber } from "./isoWeek";

export function kapittelMap(plan: ArsplanDokument): Map<number, ArsplanKapittel> {
  return new Map(plan.kapitler.map((k) => [k.nummer, k]));
}

export function buildUkeVisninger(plan: ArsplanDokument, dagensUke?: number): UkeVisning[] {
  const current = dagensUke ?? getIsoWeekNumber();
  const byNummer = kapittelMap(plan);
  return plan.uker.map((row) => ({
    uke: row.uke,
    maned: row.maned,
    periodeFokus: row.periodeFokus,
    kapittel: byNummer.get(row.kapittel) ?? null,
    erDagensUke: row.uke === current
  }));
}

export function findUke(plan: ArsplanDokument, uke: number): UkeVisning | undefined {
  return buildUkeVisninger(plan).find((u) => u.uke === uke);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
