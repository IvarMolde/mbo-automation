import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "./config.js";

export const recipientSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
  active: z.boolean().default(true),
  addedAt: z.string().min(1),
  unsubscribeToken: z.string().min(16)
});

export const recipientsStateSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().min(1),
  recipients: z.array(recipientSchema)
});

export type Recipient = z.infer<typeof recipientSchema>;
export type RecipientsState = z.infer<typeof recipientsStateSchema>;

export function emptyRecipientsState(now = new Date().toISOString()): RecipientsState {
  return { version: 1, updatedAt: now, recipients: [] };
}

export function createUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Stable token for seeded env recipient so restarts don't churn tokens. */
export function tokenForEmail(email: string): string {
  const secret = env.ADMIN_TOKEN || env.CRON_SECRET || "mbo-recipients";
  return createHmac("sha256", secret).update(`unsub:${email.toLowerCase()}`).digest("base64url");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function activeEmails(state: RecipientsState): string[] {
  return state.recipients.filter((r) => r.active).map((r) => r.email);
}
