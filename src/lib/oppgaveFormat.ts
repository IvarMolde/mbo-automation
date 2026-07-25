/**
 * Pedagogisk oppgaveformat for Word-hefter (A2–B1).
 * Skiller svarform (én vs flere) og styrer layout (○ / ☐ / linjer / ordbank).
 */

export type OppgaveSvarType = "single" | "multi" | "open" | "sant_usant" | "fyll_inn";

/** Visuelt/pedagogisk format brukt i Word-layout. */
export type OppgaveFormat =
  | "leseforstaelse"
  | "flervalg"
  | "avkryssing"
  | "sant_usant"
  | "finn_par"
  | "fyll_inn"
  | "skrive"
  | "muntlig";

export interface OppgaveDel {
  merke: string;
  tekst: string;
  svarType: OppgaveSvarType;
  alternativer?: string[];
}

export interface OppgavePar {
  venstre: string[];
  hoyre: string[];
}

export interface OppgaveRolle {
  navn: string;
  tekst: string;
}

export interface StrukturertOppgaveFelter {
  format?: OppgaveFormat;
  deler?: OppgaveDel[];
  ordbank?: string[];
  par?: OppgavePar;
  roller?: OppgaveRolle[];
}

export const RADIO = "○";
export const CHECK = "☐";

const FORMAT_LABELS: Record<OppgaveFormat, string> = {
  leseforstaelse: "Leseforståelse",
  flervalg: "Flervalg (ett svar)",
  avkryssing: "Avkryssing (flere svar)",
  sant_usant: "Sant eller usant",
  finn_par: "Finn par",
  fyll_inn: "Fyll inn / setningsstruktur",
  skrive: "Skriveoppgave",
  muntlig: "Muntlig øvelse"
};

const TYPE_TO_FORMAT: Record<string, OppgaveFormat> = {
  leseforstaelse: "leseforstaelse",
  fyll_inn_setningsstruktur: "fyll_inn",
  skriveoppgave: "skrive",
  muntlig: "muntlig",
  flervalg: "flervalg",
  avkryssing: "avkryssing",
  sant_usant: "sant_usant",
  finn_par: "finn_par",
  variert: "flervalg"
};

export function oppgaveFormatLabel(format: OppgaveFormat): string {
  return FORMAT_LABELS[format];
}

export function oppgaveTypeLabel(type: string, format?: OppgaveFormat): string {
  if (format) return FORMAT_LABELS[format];
  return FORMAT_LABELS[TYPE_TO_FORMAT[type]] ?? type.replace(/_/g, " ");
}

/** Kort elevinstruks om hvordan man svarer. */
export function svarInstruks(format: OppgaveFormat): string {
  switch (format) {
    case "flervalg":
      return "Sett ring rundt eller kryss i sirkelen (○). Velg ett svar.";
    case "avkryssing":
      return "Kryss av i rutene (☐). Ett eller flere svar kan være riktige.";
    case "sant_usant":
      return "Velg Sant eller Usant for hver påstand (○).";
    case "finn_par":
      return "Koble riktig par. Skriv bokstaven ved tallet.";
    case "fyll_inn":
      return "Bruk ordbanken. Skriv det riktige ordet på strekene.";
    case "skrive":
      return "Skriv svarene dine på linjene under.";
    case "muntlig":
      return "Øv muntlig med en partner. Kryss av når dere er ferdige med hvert steg.";
    case "leseforstaelse":
    default:
      return "Les teksten nøye. Svar på hvert spørsmål.";
  }
}

export function resolveOppgaveFormat(
  type: string,
  format?: string | null,
  undertype?: string | null
): OppgaveFormat {
  const raw = (format || undertype || "").trim().toLowerCase();
  const allowed: OppgaveFormat[] = [
    "leseforstaelse",
    "flervalg",
    "avkryssing",
    "sant_usant",
    "finn_par",
    "fyll_inn",
    "skrive",
    "muntlig"
  ];
  if (allowed.includes(raw as OppgaveFormat)) return raw as OppgaveFormat;

  const aliases: Record<string, OppgaveFormat> = {
    flervalg_flere: "avkryssing",
    flere_svar: "avkryssing",
    checkbox: "avkryssing",
    radio: "flervalg",
    multiple_choice: "flervalg",
    true_false: "sant_usant",
    matching: "finn_par",
    setningsstruktur: "fyll_inn",
    fyll_inn_setningsstruktur: "fyll_inn",
    skriveoppgave: "skrive",
    open: "skrive"
  };
  if (aliases[raw]) return aliases[raw];

  return TYPE_TO_FORMAT[type] ?? "leseforstaelse";
}

function letterFromIndex(i: number): string {
  return String.fromCharCode(97 + (i % 26));
}

/** Parse a)/b) eller 1a/1b-alternativer fra fri tekst. */
export function parseAlternativerFromText(raw: string): { stem: string; alternativer: string[] } {
  const text = raw.replace(/\r\n/g, "\n").trim();
  const firstIdx = text.search(/(?:^|[\s])(?:\d{1,2})?[a-eA-E]\s*[\)\.]/imu);
  if (firstIdx < 0) return { stem: text, alternativer: [] };

  const stem = firstIdx > 0 ? text.slice(0, firstIdx).trim() : "";
  const rest = text.slice(firstIdx).trim();
  const chunks = rest.split(/(?:^|\s)(?:\d{1,2})?[a-eA-E]\s*[\)\.]\s+/u).map((s) => s.trim()).filter(Boolean);
  // split drops markers; re-extract by regex capture groups instead
  const altMatches = [
    ...rest.matchAll(/(?:^|\s)(?:\d{1,2})?([a-eA-E])\s*[\)\.]\s*/gu)
  ];
  if (altMatches.length < 2) return { stem: text, alternativer: [] };

  const alternativer: string[] = [];
  for (let i = 0; i < altMatches.length; i++) {
    const start = (altMatches[i].index ?? 0) + altMatches[i][0].length;
    const end = i + 1 < altMatches.length ? (altMatches[i + 1].index ?? rest.length) : rest.length;
    const value = rest.slice(start, end).trim();
    if (value) alternativer.push(value);
  }
  if (alternativer.length < 2) {
    // fallback to naive chunks if capture slicing failed
    return { stem, alternativer: chunks.length >= 2 ? chunks : [] };
  }
  return { stem, alternativer };
}

export function ensureDelMerke(merke: string | undefined, oppgaveNummer: number, index: number): string {
  if (merke && /^\d{1,2}[a-eA-E]$/.test(merke.trim())) return merke.trim().toLowerCase();
  if (merke && /^[a-eA-E]$/.test(merke.trim())) return `${oppgaveNummer}${merke.trim().toLowerCase()}`;
  return `${oppgaveNummer}${letterFromIndex(index)}`;
}

export function normalizeDeler(
  raw: unknown,
  oppgaveNummer: number,
  defaultSvarType: OppgaveSvarType
): OppgaveDel[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const deler: OppgaveDel[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== "object") continue;
    const d = item as Record<string, unknown>;
    const tekst = String(d.tekst ?? d.sporsmal ?? d.pastand ?? d.innhold ?? "").trim();
    if (tekst.length < 2) continue;
    const svarRaw = String(d.svarType ?? d.svar_type ?? defaultSvarType).toLowerCase();
    const svarType: OppgaveSvarType =
      svarRaw === "multi" ||
      svarRaw === "avkryssing" ||
      svarRaw === "flere"
        ? "multi"
        : svarRaw === "sant_usant" || svarRaw === "true_false"
          ? "sant_usant"
          : svarRaw === "fyll_inn" || svarRaw === "gap"
            ? "fyll_inn"
            : svarRaw === "open" || svarRaw === "apen" || svarRaw === "åpen"
              ? "open"
              : "single";
    const alternativer = Array.isArray(d.alternativer)
      ? d.alternativer.map((a) => String(a ?? "").trim()).filter((a) => a.length > 0)
      : undefined;
    deler.push({
      merke: ensureDelMerke(String(d.merke ?? d.id ?? ""), oppgaveNummer, i),
      tekst,
      svarType,
      ...(alternativer && alternativer.length ? { alternativer } : {})
    });
  }
  return deler.length ? deler : undefined;
}

/** Bygg deler fra fri «innhold»-tekst når Gemini ikke sendte struktur. */
export function inferDelerFromInnhold(
  innhold: string,
  oppgaveNummer: number,
  format: OppgaveFormat
): OppgaveDel[] | undefined {
  const lines = innhold
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Explicit lettered parts on own lines: 1a ... / a) ...
  const lettered = lines
    .map((line, i) => {
      const m =
        line.match(/^(\d{1,2})([a-eA-E])\s*[\)\.]?\s*(.+)$/) ||
        line.match(/^([a-eA-E])\s*[\)\.]\s*(.+)$/);
      if (!m) return null;
      const merke =
        m.length === 4 ? `${m[1]}${m[2].toLowerCase()}` : ensureDelMerke(m[1], oppgaveNummer, i);
      const rest = m.length === 4 ? m[3] : m[2];
      return { merke, rest };
    })
    .filter((x): x is { merke: string; rest: string } => Boolean(x));

  if (lettered.length >= 2) {
    return lettered.map(({ merke, rest }) => {
      if (format === "sant_usant") {
        return { merke, tekst: rest.replace(/\b(sant|usant)\b/gi, "").trim() || rest, svarType: "sant_usant" as const };
      }
      if (format === "fyll_inn") {
        return { merke, tekst: rest, svarType: "fyll_inn" as const };
      }
      if (format === "flervalg" || format === "avkryssing") {
        const parsed = parseAlternativerFromText(rest);
        if (parsed.alternativer.length >= 2) {
          return {
            merke,
            tekst: parsed.stem || rest,
            svarType: format === "avkryssing" ? ("multi" as const) : ("single" as const),
            alternativer: parsed.alternativer
          };
        }
      }
      if (format === "leseforstaelse") {
        const parsed = parseAlternativerFromText(rest);
        if (parsed.alternativer.length >= 2) {
          return {
            merke,
            tekst: parsed.stem || "Velg riktig svar.",
            svarType: "single" as const,
            alternativer: parsed.alternativer
          };
        }
        return { merke, tekst: rest, svarType: "open" as const };
      }
      return {
        merke,
        tekst: rest,
        svarType: format === "skrive" || format === "muntlig" ? ("open" as const) : ("open" as const)
      };
    });
  }

  // Single block with inline a) b) c)
  if (format === "flervalg" || format === "avkryssing" || format === "leseforstaelse") {
    const parsed = parseAlternativerFromText(innhold);
    if (parsed.alternativer.length >= 2) {
      return [
        {
          merke: `${oppgaveNummer}a`,
          tekst: parsed.stem || "Velg riktig svar.",
          svarType: format === "avkryssing" ? "multi" : "single",
          alternativer: parsed.alternativer
        }
      ];
    }
  }

  return undefined;
}

export function defaultSvarTypeForFormat(format: OppgaveFormat): OppgaveSvarType {
  switch (format) {
    case "avkryssing":
      return "multi";
    case "sant_usant":
      return "sant_usant";
    case "fyll_inn":
      return "fyll_inn";
    case "flervalg":
      return "single";
    default:
      return "open";
  }
}
