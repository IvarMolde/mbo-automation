import { env } from "./config.js";

export type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
};

/**
 * Parse GOOGLE_SERVICE_ACCOUNT_JSON for Vertex AI on serverless (Vercel).
 * Returns undefined when unset so local ADC / key file can still be used.
 */
export function getServiceAccountCredentials(): ServiceAccountCredentials | undefined {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON ?? env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
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
