import type { ArsplanDokument } from "../schemas/planlegging.js";
import { getArsplan } from "./arsplanResolve.js";
import { applyProfileToArsplan } from "./schoolYearGenerate.js";
import { getSchoolYearCached, loadSchoolYearProfile } from "./schoolYearStore.js";

/** Sync: use after loadSchoolYearProfile() in the same request. */
export function getScheduleArsplanCached(): ArsplanDokument | null {
  const base = getArsplan();
  if (!base) return null;
  return applyProfileToArsplan(base, getSchoolYearCached());
}

/** Async: load school-year profile then return overlaid årsplan. */
export async function getScheduleArsplan(): Promise<ArsplanDokument | null> {
  await loadSchoolYearProfile();
  return getScheduleArsplanCached();
}
