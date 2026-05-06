import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_LOCATION: z.string().default("europe-north1"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(8).optional(),
  RECIPIENT_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().min(12).optional()
});

export const env = envSchema.parse(process.env);
