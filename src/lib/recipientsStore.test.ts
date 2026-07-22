import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("recipientsStore", () => {
  let dir: string;

  beforeEach(() => {
    vi.resetModules();
    dir = mkdtempSync(join(tmpdir(), "mbo-rec-"));
    process.env.PLAN_STATE_PATH = join(dir, "plan-state.json");
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    delete process.env.VERCEL;
    process.env.RECIPIENT_EMAIL = "fallback@example.com";
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("seeds from RECIPIENT_EMAIL and supports add/remove", async () => {
    const store = await import("../lib/recipientsStore.js");
    store.resetRecipientsCacheForTests();
    const loaded = await store.loadRecipientsState();
    expect(loaded.recipients.map((r) => r.email)).toContain("fallback@example.com");

    await store.addRecipient("larer@skole.no", "Lærer");
    const afterAdd = await store.loadRecipientsState();
    expect(afterAdd.recipients.some((r) => r.email === "larer@skole.no" && r.active)).toBe(true);

    await store.removeRecipient("fallback@example.com");
    const afterRemove = await store.loadRecipientsState();
    expect(afterRemove.recipients.some((r) => r.email === "fallback@example.com")).toBe(false);

    const emails = await store.listActiveRecipientEmails();
    expect(emails).toEqual(["larer@skole.no"]);

    const saved = JSON.parse(readFileSync(join(dir, "recipients.json"), "utf8")) as {
      recipients: Array<{ email: string }>;
    };
    expect(saved.recipients.map((r) => r.email)).toEqual(["larer@skole.no"]);
  });
});
