import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import { env } from "./config.js";
import { setSchoolYearStartWeek } from "./planSchedule.js";
import { schoolYearProfileSchema, type SchoolYearProfile } from "./schoolYearState.js";
import { getIsoWeekParts, parseDateOnly } from "./schoolYearGenerate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function localStatePath(): string {
  return env.SCHOOL_YEAR_STATE_PATH ?? join(__dirname, "../../data/school-year.json");
}

function useTurso(): boolean {
  return Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
}

let turso: Client | null = null;
let tursoReady: Promise<void> | null = null;
let memoryProfile: SchoolYearProfile | null = null;
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
        CREATE TABLE IF NOT EXISTS school_year_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
    })();
  }
  await tursoReady;
}

function activateProfile(profile: SchoolYearProfile | null): SchoolYearProfile | null {
  if (profile?.applied) {
    const startWeek =
      profile.startWeek ??
      (profile.startDate ? getIsoWeekParts(parseDateOnly(profile.startDate)).week : undefined);
    setSchoolYearStartWeek(startWeek);
  } else {
    setSchoolYearStartWeek(null);
  }
  return profile;
}

function readLocalFile(): SchoolYearProfile | null {
  const path = localStatePath();
  if (!existsSync(path)) return null;
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = schoolYearProfileSchema.safeParse(raw);
    return parsed.success ? activateProfile(parsed.data) : null;
  } catch {
    return null;
  }
}

function writeLocalFile(profile: SchoolYearProfile): void {
  const path = localStatePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
}

export function getSchoolYearStoreMeta(): { backend: "turso" | "file"; writable: boolean } {
  if (useTurso()) return { backend: "turso", writable: true };
  const onVercel = Boolean(process.env.VERCEL);
  return { backend: "file", writable: !onVercel };
}

export function getSchoolYearCached(): SchoolYearProfile | null {
  if (!memoryLoaded && !useTurso()) {
    memoryProfile = readLocalFile();
    memoryLoaded = true;
  }
  return memoryProfile;
}

export async function loadSchoolYearProfile(): Promise<SchoolYearProfile | null> {
  if (useTurso()) {
    await ensureTursoTable();
    const result = await getTurso().execute("SELECT payload FROM school_year_state WHERE id = 1");
    const row = result.rows[0];
    if (!row?.payload) {
      memoryProfile = null;
      memoryLoaded = true;
      return null;
    }
    const raw: unknown = JSON.parse(String(row.payload));
    const parsed = schoolYearProfileSchema.safeParse(raw);
    memoryProfile = parsed.success ? activateProfile(parsed.data) : null;
    memoryLoaded = true;
    return memoryProfile;
  }
  memoryProfile = readLocalFile();
  memoryLoaded = true;
  return memoryProfile;
}

export async function saveSchoolYearProfile(profile: SchoolYearProfile): Promise<void> {
  const meta = getSchoolYearStoreMeta();
  if (!meta.writable) {
    throw new Error(
      "Skoleår kan ikke lagres på Vercel uten Turso. Sett TURSO_DATABASE_URL og TURSO_AUTH_TOKEN."
    );
  }
  const validated = schoolYearProfileSchema.parse(profile);
  activateProfile(validated);
  if (meta.backend === "turso") {
    await ensureTursoTable();
    await getTurso().execute({
      sql: `
        INSERT INTO school_year_state (id, payload, updated_at)
        VALUES (1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at
      `,
      args: [JSON.stringify(validated), validated.updatedAt]
    });
  } else {
    writeLocalFile(validated);
  }
  memoryProfile = validated;
  memoryLoaded = true;
}

/** Test helper */
export function resetSchoolYearCacheForTests(): void {
  memoryProfile = null;
  memoryLoaded = false;
  setSchoolYearStartWeek(null);
}
