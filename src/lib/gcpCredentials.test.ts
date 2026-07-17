import { afterEach, describe, expect, it, vi } from "vitest";

describe("getServiceAccountCredentials", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns undefined when env is unset", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", undefined);
    const { getServiceAccountCredentials } = await import("./gcpCredentials.js");
    expect(getServiceAccountCredentials()).toBeUndefined();
  });

  it("parses valid service account JSON", async () => {
    const json = JSON.stringify({
      client_email: "sa@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n",
      project_id: "demo"
    });
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", json);
    const { getServiceAccountCredentials } = await import("./gcpCredentials.js");
    const creds = getServiceAccountCredentials();
    expect(creds?.client_email).toBe("sa@example.iam.gserviceaccount.com");
    expect(creds?.project_id).toBe("demo");
  });

  it("throws on invalid JSON", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "{not-json");
    const { getServiceAccountCredentials } = await import("./gcpCredentials.js");
    expect(() => getServiceAccountCredentials()).toThrow(/ugyldig JSON/i);
  });

  it("throws when required fields are missing", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ type: "service_account" }));
    const { getServiceAccountCredentials } = await import("./gcpCredentials.js");
    expect(() => getServiceAccountCredentials()).toThrow(/client_email|private_key/i);
  });
});
