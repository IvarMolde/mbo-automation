import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(120),
  GCP_PROJECT_ID: z.string().optional(),
  GCP_LOCATION: z.string().default("europe-north1"),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  /** Full service-account JSON as a single string (for Vercel / serverless). */
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(2).optional(),
  GMAIL_USER: z.string().email().optional(),
  GMAIL_APP_PASSWORD: z.string().min(8).optional(),
  RECIPIENT_EMAIL: z.string().email().optional(),
  CRON_SECRET: z.string().min(12).optional(),
  ARSPLAN_JSON_PATH: z.string().min(1).optional(),
  CEFR_MARKDOWN_PATH: z.string().min(1).optional()
});

export const env = envSchema.parse(process.env);
