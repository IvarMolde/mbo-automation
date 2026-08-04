import { z } from "zod";

/**
 * period = ferieperiode som kan låse hele skoleuker (uten undervisning)
 * day = enkeltdag (kurs, planlegging, 1. mai …) — uken fortsetter med undervisning
 */
export const holidaySchema = z.object({
  name: z.string().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["period", "day"]).default("period")
});

export const generatedUkeSchema = z.object({
  uke: z.number().int().min(1).max(53),
  kapittel: z.number().int().positive().nullable(),
  maned: z.string().max(40),
  periodeFokus: z.string().max(500)
});

export const breakSummaryPeriodSchema = z.object({
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  lockedWeeks: z.array(z.number().int()),
  partialWeeks: z.array(
    z.object({
      uke: z.number().int(),
      weekdayCount: z.number().int(),
      dates: z.array(z.string())
    })
  ),
  label: z.string()
});

export const breakSummaryDaySchema = z.object({
  name: z.string(),
  date: z.string(),
  uke: z.number().int(),
  label: z.string()
});

export const breakSummarySchema = z.object({
  periods: z.array(breakSummaryPeriodSchema),
  days: z.array(breakSummaryDaySchema)
});

export const schoolYearProfileSchema = z.object({
  version: z.literal(1),
  /** Valgfritt navn, f.eks. «Molde voksenopplæring 2026–2027» */
  label: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  holidays: z.array(holidaySchema).max(60).default([]),
  /** Skoleuker uten undervisning (kun fra ferieperioder med nok ukedager) */
  holidayWeeks: z.array(z.number().int().min(1).max(53)).default([]),
  /** Presis oppsummering for UI */
  breakSummary: breakSummarySchema.optional(),
  /** Genererte undervisningsuker med kapittelfordeling */
  generatedUker: z.array(generatedUkeSchema).default([]),
  applied: z.boolean().default(false),
  appliedAt: z.string().max(40).optional(),
  updatedAt: z.string().max(40)
});

export type Holiday = z.infer<typeof holidaySchema>;
export type GeneratedUke = z.infer<typeof generatedUkeSchema>;
export type BreakSummary = z.infer<typeof breakSummarySchema>;
export type SchoolYearProfile = z.infer<typeof schoolYearProfileSchema>;

export function emptySchoolYearProfile(): SchoolYearProfile {
  return {
    version: 1,
    startDate: "",
    endDate: "",
    holidays: [],
    holidayWeeks: [],
    generatedUker: [],
    applied: false,
    updatedAt: new Date(0).toISOString()
  };
}
