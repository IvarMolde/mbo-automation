import { type Response, Router } from "express";
import { z } from "zod";
import { getArsplan } from "../lib/arsplanResolve.js";
import { appendOperation, computeEffectiveSchedule } from "../lib/planSchedule.js";
import { savePlanState } from "../lib/planStore.js";
import { AdminAuthError, requireAdmin } from "../lib/requireAdmin.js";
import {
  applyProfileToArsplan,
  generateSchoolYearPlan,
  isoWeeksInRange
} from "../lib/schoolYearGenerate.js";
import { holidaySchema, type Holiday } from "../lib/schoolYearState.js";
import {
  getSchoolYearCached,
  getSchoolYearStoreMeta,
  loadSchoolYearProfile,
  saveSchoolYearProfile
} from "../lib/schoolYearStore.js";
import type { PlanState } from "../lib/planState.js";

export const schoolYearRouter = Router();

class SchoolYearApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "SchoolYearApiError";
  }
}

const applySchema = z.object({
  label: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  holidays: z.array(holidaySchema).max(40).default([])
});

function holidayNameForWeek(uke: number, holidays: Holiday[]): string {
  for (const h of holidays) {
    try {
      if (isoWeeksInRange(h.startDate, h.endDate).includes(uke)) {
        return h.name;
      }
    } catch {
      /* skip invalid */
    }
  }
  return "Ferie";
}

function buildHolidayLockState(profileAppliedAt: string, holidayWeeks: number[], holidays: Holiday[]): PlanState {
  let state: PlanState = {
    version: 1,
    operations: [],
    updatedAt: profileAppliedAt
  };
  state = appendOperation(state, { type: "reset", at: profileAppliedAt });
  for (const uke of holidayWeeks) {
    state = appendOperation(state, {
      type: "lock",
      uke,
      note: holidayNameForWeek(uke, holidays),
      at: new Date().toISOString()
    });
  }
  return state;
}

schoolYearRouter.get("/skolear", async (_req, res) => {
  try {
    const profile = await loadSchoolYearProfile();
    res.json({
      success: true,
      configured: Boolean(profile?.applied),
      profile: profile?.applied ? profile : null,
      store: getSchoolYearStoreMeta()
    });
  } catch (error) {
    handleError(res, error);
  }
});

/**
 * Lagre og anvend skoleår: generer uker, nullstill plan-tilpasninger,
 * lås ferieuker automatisk.
 */
schoolYearRouter.post("/skolear/apply", async (req, res) => {
  try {
    requireAdmin(req);
    const body = applySchema.parse(req.body);
    const plan = getArsplan();
    if (!plan) {
      throw new SchoolYearApiError(503, "Årsplan (kapittelkatalog) mangler.");
    }

    const profile = generateSchoolYearPlan(body, plan);
    await saveSchoolYearProfile(profile);

    const next = buildHolidayLockState(
      profile.appliedAt ?? new Date().toISOString(),
      profile.holidayWeeks,
      profile.holidays
    );
    await savePlanState(next);

    const overlaid = applyProfileToArsplan(plan, profile);
    const effective = computeEffectiveSchedule(overlaid, next);

    res.json({
      success: true,
      message: "Skoleåret er lagret og planen er generert.",
      profile,
      effective,
      teachingWeeks: profile.generatedUker.filter((u) => u.kapittel != null).length,
      holidayWeeks: profile.holidayWeeks.length
    });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown): void {
  if (error instanceof AdminAuthError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof SchoolYearApiError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, error: "Ugyldig forespørsel.", details: error.flatten() });
    return;
  }
  const raw = error instanceof Error ? error.message : String(error);
  console.error("[skolear]", raw);
  if (/sluttdato|startdato|Ugyldig dato|Ferie/i.test(raw)) {
    res.status(400).json({ success: false, error: raw });
    return;
  }
  res.status(500).json({
    success: false,
    error: /Turso|lagres/i.test(raw) ? raw : "Kunne ikke lagre skoleår."
  });
}

/** Sync helper for other modules after loadSchoolYearProfile(). */
export function getActiveSchoolYearProfile() {
  return getSchoolYearCached();
}
