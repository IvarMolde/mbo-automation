import { z } from "zod";

export const genererSchema = z.object({
  /** Utelates for å bruke årsplan-rad for gitt ISO-uke. */
  kapittelNummer: z.number().int().positive().max(500).optional(),
  uke: z.number().int().min(1).max(53),
  /** Tvinger innhold fra dette kapittelet (yrke/grammatikk fra katalog), uavhengig av årsplan. */
  overstyrKapittelNummer: z.number().int().positive().max(500).optional(),
  laererTilleggsinstruks: z.string().max(4000).optional()
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
  contentSource: z.enum(["gemini", "fallback"]),
  geminiError: z.string().max(2000).optional(),
  files: z.object({
    wordBytes: z.number().int().nonnegative()
  })
});

export const successMessageResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  contentSource: z.enum(["gemini", "fallback"]).optional(),
  geminiError: z.string().max(2000).optional()
});

export const cronResponseSchema = successMessageResponseSchema.extend({
  kapittel: z.number().int().positive(),
  uke: z.number().int().min(1).max(53),
  contentSource: z.enum(["gemini", "fallback"]),
  recipients: z.number().int().nonnegative().optional()
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  details: z.unknown().optional()
});

export * from "./planlegging.js";
