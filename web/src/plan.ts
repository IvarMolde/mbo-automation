import type {
  ArsplanDokument,
  ArsplanKapittel,
  EffectiveUke,
  PlanApiResponse,
  UkeVisning
} from "./types";
import { getIsoWeekNumber } from "./isoWeek";

export function kapittelMap(plan: Pick<ArsplanDokument, "kapitler">): Map<number, ArsplanKapittel> {
  return new Map(plan.kapitler.map((k) => [k.nummer, k]));
}

export function buildUkeVisninger(
  plan: ArsplanDokument,
  effectiveUker?: EffectiveUke[],
  dagensUke?: number
): UkeVisning[] {
  const current = dagensUke ?? getIsoWeekNumber();
  const byNummer = kapittelMap(plan);

  if (effectiveUker?.length) {
    return effectiveUker.map((row) => ({
      uke: row.uke,
      maned: row.maned || plan.uker.find((u) => u.uke === row.uke)?.maned || "",
      periodeFokus: row.periodeFokus,
      kapittel: row.kapittelNummer != null ? byNummer.get(row.kapittelNummer) ?? null : null,
      erDagensUke: row.uke === current,
      status: row.status,
      endret: row.endret,
      baseKapittelNummer: row.baseKapittelNummer
    }));
  }

  return plan.uker.map((row) => ({
    uke: row.uke,
    maned: row.maned,
    periodeFokus: row.periodeFokus,
    kapittel: byNummer.get(row.kapittel) ?? null,
    erDagensUke: row.uke === current,
    status: "teaching" as const,
    endret: false,
    baseKapittelNummer: row.kapittel
  }));
}

export function findUke(
  plan: ArsplanDokument,
  uke: number,
  effectiveUker?: EffectiveUke[]
): UkeVisning | undefined {
  return buildUkeVisninger(plan, effectiveUker).find((u) => u.uke === uke);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function toArsplanDokument(api: PlanApiResponse): ArsplanDokument {
  return {
    metadata: api.metadata,
    perioder: api.perioder,
    uker: api.baseUker,
    kapitler: api.kapitler
  };
}
