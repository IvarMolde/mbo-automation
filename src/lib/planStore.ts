import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { env } from "./config.js";
import { emptyPlanState, planStateSchema, type PlanState } from "./planState.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function localStatePath(): string {
  return env.PLAN_STATE_PATH ?? join(__dirname, "../../data/plan-state.json");
}

function useTurso(): boolean {
  return Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

let turso: Client | null = null;
let tursoReady: Promise<void> | null = null;
let memoryState: PlanState = emptyPlanState();
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
      const db = getTurso();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS plan_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    })();
  }
  await tursoReady;
}

function readLocalFile(): PlanState {
  const path = localStatePath();
  if (!existsSync(path)) {
    return emptyPlanState();
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = planStateSchema.safeParse(raw);
    return parsed.success ? parsed.data : emptyPlanState();
  } catch {
    return emptyPlanState();
  }
}

function writeLocalFile(state: PlanState): void {
  const path = localStatePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export type PlanStoreMeta = {
  backend: "turso" | "file";
  writable: boolean;
};

export function getPlanStoreMeta(): PlanStoreMeta {
  if (useTurso()) {
    return { backend: "turso", writable: true };
  }
  const onVercel = Boolean(process.env.VERCEL);
  return { backend: "file", writable: !onVercel };
}

/** Sync cache for resolvers; prefer await loadPlanState() first in async handlers. */
export function getPlanStateCached(): PlanState {
  if (!memoryLoaded && !useTurso()) {
    memoryState = readLocalFile();
    memoryLoaded = true;
  }
  return memoryState;
}

export async function loadPlanState(): Promise<PlanState> {
  if (useTurso()) {
    await ensureTursoTable();
    const result = await getTurso().execute("SELECT payload FROM plan_state WHERE id = 1");
    const row = result.rows[0];
    if (!row?.payload) {
      memoryState = emptyPlanState();
      memoryLoaded = true;
      return memoryState;
    }
    const raw: unknown = JSON.parse(String(row.payload));
    const parsed = planStateSchema.safeParse(raw);
    memoryState = parsed.success ? parsed.data : emptyPlanState();
    memoryLoaded = true;
    return memoryState;
  }
  memoryState = readLocalFile();
  memoryLoaded = true;
  return memoryState;
}

export async function savePlanState(state: PlanState): Promise<void> {
  const meta = getPlanStoreMeta();
  if (!meta.writable) {
    throw new Error(
      "Planendringer kan ikke lagres på Vercel uten Turso. Sett TURSO_DATABASE_URL og TURSO_AUTH_TOKEN."
    );
  }
  if (meta.backend === "turso") {
    await ensureTursoTable();
    await getTurso().execute({
      sql: `
        INSERT INTO plan_state (id, payload, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `,
      args: [JSON.stringify(state), state.updatedAt]
    });
  } else {
    writeLocalFile(state);
  }
  memoryState = state;
  memoryLoaded = true;
}

/** Test helper */
export function resetPlanStateCacheForTests(): void {
  memoryState = emptyPlanState();
  memoryLoaded = false;
}
