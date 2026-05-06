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
