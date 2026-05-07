import { z } from "zod";

export const genererSchema = z.object({
  kapittelNummer: z.number().int().positive(),
  uke: z.number().int().min(1).max(53)
});

export const sendSchema = genererSchema.extend({
  motaker: z.string().email()
});

export const testEmailSchema = z.object({
  motaker: z.string().email()
});

export const genererResponseSchema = z.object({
  success: z.literal(true),
  kapittel: z.number().int().positive(),
  uke: z.number().int().min(1).max(53),
  files: z.object({
    wordBytes: z.number().int().nonnegative(),
    pptxBytes: z.number().int().nonnegative()
  })
});

export const successMessageResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1)
});

export const cronResponseSchema = successMessageResponseSchema.extend({
  kapittel: z.number().int().positive(),
  uke: z.number().int().min(1).max(53)
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  details: z.unknown().optional()
});
