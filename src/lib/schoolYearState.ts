import { z } from "zod";

export const holidaySchema = z.object({
  name: z.string().min(1).max(120),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
});

export const generatedUkeSchema = z.object({
  uke: z.number().int().min(1).max(53),
  kapittel: z.number().int().positive().nullable(),
  maned: z.string().max(40),
  periodeFokus: z.string().max(500)
});

export const schoolYearProfileSchema = z.object({
  version: z.literal(1),
  /** Valgfritt navn, f.eks. «Molde voksenopplæring 2026–2027» */
  label: z.string().max(200).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  holidays: z.array(holidaySchema).max(40).default([]),
  /** ISO-uker som er ferie (beregnet ved lagring) */
  holidayWeeks: z.array(z.number().int().min(1).max(53)).default([]),
  /** Genererte undervisningsuker med kapittelfordeling */
  generatedUker: z.array(generatedUkeSchema).default([]),
  applied: z.boolean().default(false),
  appliedAt: z.string().max(40).optional(),
  updatedAt: z.string().max(40)
});

export type Holiday = z.infer<typeof holidaySchema>;
export type GeneratedUke = z.infer<typeof generatedUkeSchema>;
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
