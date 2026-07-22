import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { env } from "./config.js";
import { getPlanStoreMeta } from "./planStore.js";
import {
  activeEmails,
  createUnsubscribeToken,
  emptyRecipientsState,
  normalizeEmail,
  recipientsStateSchema,
  tokenForEmail,
  type Recipient,
  type RecipientsState
} from "./recipientsState.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function localRecipientsPath(): string {
  return env.PLAN_STATE_PATH
    ? join(dirname(env.PLAN_STATE_PATH), "recipients.json")
    : join(__dirname, "../../data/recipients.json");
}

function useTurso(): boolean {
  return Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

let turso: Client | null = null;
let tursoReady: Promise<void> | null = null;
let memoryState: RecipientsState = emptyRecipientsState();
let memoryLoaded = false;

function getTurso(): Client {
  if (!turso) {
    turso = createClient({
      url: env.TURSO_DATABASE_URL!,
      authToken: env.TURSO_AUTH_TOKEN!
    });
  }
  return turso;
}

async function ensureTursoTable(): Promise<void> {
  if (!tursoReady) {
    tursoReady = (async () => {
      await getTurso().execute(`
        CREATE TABLE IF NOT EXISTS recipients_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    })();
  }
  await tursoReady;
}

function readLocalFile(): RecipientsState {
  const path = localRecipientsPath();
  if (!existsSync(path)) return emptyRecipientsState();
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = recipientsStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : emptyRecipientsState();
  } catch {
    return emptyRecipientsState();
  }
}

function writeLocalFile(state: RecipientsState): void {
  const path = localRecipientsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function seedFromEnv(state: RecipientsState): RecipientsState {
  if (state.recipients.length > 0 || !env.RECIPIENT_EMAIL) return state;
  const email = normalizeEmail(env.RECIPIENT_EMAIL);
  const now = new Date().toISOString();
  return {
    version: 1,
    updatedAt: now,
    recipients: [
      {
        email,
        name: "Standard (fra miljø)",
        active: true,
        addedAt: now,
        unsubscribeToken: tokenForEmail(email)
      }
    ]
  };
}

export async function loadRecipientsState(): Promise<RecipientsState> {
  let state: RecipientsState;
  if (useTurso()) {
    await ensureTursoTable();
    const result = await getTurso().execute("SELECT payload FROM recipients_state WHERE id = 1");
    const row = result.rows[0];
    if (!row?.payload) {
      state = emptyRecipientsState();
    } else {
      const raw: unknown = JSON.parse(String(row.payload));
      const parsed = recipientsStateSchema.safeParse(raw);
      state = parsed.success ? parsed.data : emptyRecipientsState();
    }
  } else {
    state = readLocalFile();
  }

  const seeded = seedFromEnv(state);
  if (seeded.recipients.length > 0 && state.recipients.length === 0) {
    const meta = getPlanStoreMeta();
    if (meta.writable) {
      await saveRecipientsState(seeded);
      return seeded;
    }
  }

  memoryState = seeded;
  memoryLoaded = true;
  return memoryState;
}

export async function saveRecipientsState(state: RecipientsState): Promise<void> {
  const meta = getPlanStoreMeta();
  if (!meta.writable) {
    throw new Error(
      "Mottakere kan ikke lagres på Vercel uten Turso. Sett TURSO_DATABASE_URL og TURSO_AUTH_TOKEN."
    );
  }
  const next = { ...state, updatedAt: new Date().toISOString() };
  if (meta.backend === "turso") {
    await ensureTursoTable();
    await getTurso().execute({
      sql: `
        INSERT INTO recipients_state (id, payload, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `,
      args: [JSON.stringify(next), next.updatedAt]
    });
  } else {
    writeLocalFile(next);
  }
  memoryState = next;
  memoryLoaded = true;
}

export async function listActiveRecipientEmails(): Promise<string[]> {
  const state = await loadRecipientsState();
  const emails = activeEmails(state);
  if (emails.length > 0) return emails;
  if (env.RECIPIENT_EMAIL) return [normalizeEmail(env.RECIPIENT_EMAIL)];
  return [];
}

export async function addRecipient(emailRaw: string, name?: string): Promise<RecipientsState> {
  const email = normalizeEmail(emailRaw);
  const state = await loadRecipientsState();
  const existing = state.recipients.find((r) => r.email === email);
  const now = new Date().toISOString();
  let recipients: Recipient[];
  if (existing) {
    recipients = state.recipients.map((r) =>
      r.email === email
        ? { ...r, active: true, name: name ?? r.name, addedAt: r.addedAt }
        : r
    );
  } else {
    recipients = [
      ...state.recipients,
      {
        email,
        name,
        active: true,
        addedAt: now,
        unsubscribeToken: createUnsubscribeToken()
      }
    ];
  }
  const next = { version: 1 as const, updatedAt: now, recipients };
  await saveRecipientsState(next);
  return next;
}

export async function removeRecipient(emailRaw: string): Promise<RecipientsState> {
  const email = normalizeEmail(emailRaw);
  const state = await loadRecipientsState();
  const next = {
    version: 1 as const,
    updatedAt: new Date().toISOString(),
    recipients: state.recipients.filter((r) => r.email !== email)
  };
  await saveRecipientsState(next);
  return next;
}

export async function deactivateByUnsubscribeToken(token: string): Promise<boolean> {
  const state = await loadRecipientsState();
  let found = false;
  const recipients = state.recipients.map((r) => {
    if (r.unsubscribeToken === token && r.active) {
      found = true;
      return { ...r, active: false };
    }
    return r;
  });
  if (!found) return false;
  await saveRecipientsState({
    version: 1,
    updatedAt: new Date().toISOString(),
    recipients
  });
  return true;
}

/** Public view without unsubscribe tokens */
export function publicRecipients(state: RecipientsState) {
  return state.recipients.map(({ email, name, active, addedAt }) => ({
    email,
    name,
    active,
    addedAt
  }));
}

export function resetRecipientsCacheForTests(): void {
  memoryState = emptyRecipientsState();
  memoryLoaded = false;
}
