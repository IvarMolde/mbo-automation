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

/** Manuell utsending av hefte for valgt ISO-uke (admin). */
export const manueltSendSchema = z.object({
  uke: z.number().int().min(1).max(53),
  /** all = aktive mottakere, one = kun motaker */
  mode: z.enum(["all", "one"]).default("one"),
  motaker: z.string().email().optional()
}).superRefine((val, ctx) => {
  if (val.mode === "one" && !val.motaker) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "motaker er påkrevd når mode er one",
      path: ["motaker"]
    });
  }
});

export const manueltSendResponseSchema = successMessageResponseSchema.extend({
  kapittel: z.number().int().positive(),
  uke: z.number().int().min(1).max(53),
  /** sent = ferdig i samme request; accepted = generering/sending fortsetter i bakgrunn (Vercel). */
  status: z.enum(["sent", "accepted"]).default("sent"),
  contentSource: z.enum(["gemini", "fallback"]).optional(),
  sentTo: z.array(z.string().email())
});

/** Manuell utsending av ekstraoppgaver (eget dokument per nivå). */
export const ekstraSendSchema = z.object({
  uke: z.number().int().min(1).max(53),
  nivaer: z.array(z.enum(["enklere", "vanskeligere"])).min(1).max(2),
  temaer: z
    .array(z.enum(["lareverk", "yrke", "arbeidsnorsk", "hverdagssituasjon", "grammatikk"]))
    .min(1)
    .max(5),
  mode: z.enum(["all", "one"]).default("one"),
  motaker: z.string().email().optional()
}).superRefine((val, ctx) => {
  if (val.mode === "one" && !val.motaker) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "motaker er påkrevd når mode er one",
      path: ["motaker"]
    });
  }
  // unique nivaer
  if (new Set(val.nivaer).size !== val.nivaer.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "nivaer kan ikke ha duplikater",
      path: ["nivaer"]
    });
  }
});

export const ekstraSendResponseSchema = successMessageResponseSchema.extend({
  kapittel: z.number().int().positive(),
  uke: z.number().int().min(1).max(53),
  sent: z.array(
    z.object({
      niva: z.enum(["enklere", "vanskeligere"]),
      contentSource: z.enum(["gemini", "fallback"]),
      sentTo: z.array(z.string().email())
    })
  )
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1),
  details: z.unknown().optional()
});

export * from "./planlegging.js";
