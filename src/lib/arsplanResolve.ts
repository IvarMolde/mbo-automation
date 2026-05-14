import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arsplanDokumentSchema } from "../schemas/planlegging.js";
import type { ArsplanDokument } from "../schemas/planlegging.js";
import { env } from "./config.js";
import { getCefrCanDoForNivaa, getKapittel, getKapittelForUkeModulo } from "./parser.js";
import type { CefrNivaa, Kapittel } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

type ArsplanKapitel = ArsplanDokument["kapitler"][number];

let arsplanCache: ArsplanDokument | null | "failed" | undefined;

/** Nullstill cache (brukes i tester). */
export function resetArsplanCache(): void {
  arsplanCache = undefined;
}

function defaultArsplanPath(): string {
  return env.ARSPLAN_JSON_PATH ?? join(__dirname, "../../data/arsplan-2026-2027.json");
}

export function getArsplan(): ArsplanDokument | null {
  if (arsplanCache !== undefined) {
    return arsplanCache === "failed" ? null : arsplanCache;
  }
  const path = defaultArsplanPath();
  if (!existsSync(path)) {
    arsplanCache = "failed";
    return null;
  }
  try {
    const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = arsplanDokumentSchema.safeParse(raw);
    if (!parsed.success) {
      console.error("Årsplan validering feilet:", parsed.error.flatten());
      arsplanCache = "failed";
      return null;
    }
    arsplanCache = parsed.data;
    return parsed.data;
  } catch (e) {
    console.error("Årsplan kunne ikke leses:", e);
    arsplanCache = "failed";
    return null;
  }
}

function pickCefrNivaa(ch: ArsplanKapitel): CefrNivaa {
  if (ch.standardNiva === "A2" || ch.standardNiva === "B1") {
    return ch.standardNiva;
  }
  const hit = ch.cefrNivaa.find((n): n is CefrNivaa => n === "A2" || n === "B1");
  return hit ?? "A2";
}

function mapArsplanKapitelTilKapittel(ch: ArsplanKapitel): Kapittel {
  const nivaa = pickCefrNivaa(ch);
  const base = getKapittel(ch.nummer);
  const cefrCanDo = base?.cefrCanDo ?? getCefrCanDoForNivaa(nivaa);
  return {
    nummer: ch.nummer,
    yrke: ch.yrke,
    grammatikk: ch.grammatikk,
    arbeidsnorskTema: ch.arbeidsnorskTema ?? ch.tittel,
    cefrNivaa: nivaa,
    cefrCanDo: {
      resepsjon: [...cefrCanDo.resepsjon],
      samhandling: [...cefrCanDo.samhandling],
      produksjon: [...cefrCanDo.produksjon]
    }
  };
}

export type UkeResolution =
  | { type: "arsplan"; kapittel: Kapittel }
  | { type: "fallback"; kapittel: Kapittel }
  | { type: "overstyring"; kapittel: Kapittel }
  | { type: "mangler_uke"; isoUke: number };

export function resolveKapittelForIsoUke(
  isoUke: number,
  opts?: { overstyrKapittelNummer?: number }
): UkeResolution {
  if (opts?.overstyrKapittelNummer != null) {
    const k = getKapittel(opts.overstyrKapittelNummer);
    if (!k) {
      throw new Error(`Kapittel ${opts.overstyrKapittelNummer} finnes ikke.`);
    }
    return { type: "overstyring", kapittel: k };
  }

  const plan = getArsplan();
  if (!plan) {
    return { type: "fallback", kapittel: getKapittelForUkeModulo(isoUke) };
  }

  const row = plan.uker.find((u) => u.uke === isoUke);
  if (!row) {
    return { type: "mangler_uke", isoUke };
  }

  const ch = plan.kapitler.find((k) => k.nummer === row.kapittel);
  if (!ch) {
    return { type: "fallback", kapittel: getKapittelForUkeModulo(isoUke) };
  }

  return { type: "arsplan", kapittel: mapArsplanKapitelTilKapittel(ch) };
}
