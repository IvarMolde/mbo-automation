import { env } from "./config.js";

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
};

/**
 * Parse service-account JSON for Vertex AI on serverless (Vercel).
 * Tries GOOGLE_SERVICE_ACCOUNT_JSON first, then GOOGLE_APPLICATION_CREDENTIALS_JSON.
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | undefined {
  const candidates = [
    env.GOOGLE_SERVICE_ACCOUNT_JSON,
    env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  ].filter((value): value is string => Boolean(value?.trim()));

  if (candidates.length === 0) {
    return undefined;
  }

  const errors: string[] = [];
  for (const raw of candidates) {
    try {
      return parseServiceAccountJson(raw);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors[0] ?? "GOOGLE_SERVICE_ACCOUNT_JSON er ugyldig JSON.");
}

function parseServiceAccountJson(raw: string): ServiceAccountCredentials {
  const normalized = normalizeEnvJson(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON er ugyldig JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ServiceAccountCredentials).client_email !== "string" ||
    typeof (parsed as ServiceAccountCredentials).private_key !== "string"
  ) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON mangler client_email eller private_key."
    );
  }

  const credentials = parsed as ServiceAccountCredentials;
  // Vercel/env often stores private_key with literal \n instead of real newlines.
  credentials.private_key = credentials.private_key.replace(/\\n/g, "\n");
  return credentials;
}

/** Fix common Vercel paste issues (smart quotes, BOM, accidental wrapping). */
function normalizeEnvJson(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}
