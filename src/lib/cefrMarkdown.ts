import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_CHARS = 2_500;

let cache: string | null | undefined;

function defaultMarkdownPath(): string {
  return env.CEFR_MARKDOWN_PATH ?? join(__dirname, "../../docs/beskrivelser_norskniva_A1_B1.md");
}

/** Leser kuratert CEFR-markdown fra repo (tom streng hvis fil mangler). */
export function getCefrNivaMarkdownTekst(): string {
  if (cache !== undefined) {
    return cache ?? "";
  }
  const path = defaultMarkdownPath();
  if (!existsSync(path)) {
    cache = null;
    return "";
  }
  try {
    const raw = readFileSync(path, "utf8");
    cache = raw.length > MAX_CHARS ? `${raw.slice(0, MAX_CHARS)}\n\n[Avkortet for prompt-lengde]` : raw;
    return cache;
  } catch {
    cache = null;
    return "";
  }
}
