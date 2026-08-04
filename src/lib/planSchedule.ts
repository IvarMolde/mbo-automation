import type { ArsplanDokument } from "../schemas/planlegging.js";
import type { PlanOperation, PlanState, WeekFieldOverride } from "./planState.js";
import { emptyPlanState } from "./planState.js";

/** Default when no Skoleår-profil er satt (historisk fasit startet uke 34). */
const DEFAULT_YEAR_START_WEEK = 34;

let activeYearStartWeek = DEFAULT_YEAR_START_WEEK;

/** Sett første skoleuke i året (fra Skoleår-profil). Påvirker sortering/forskyvning. */
export function setSchoolYearStartWeek(week: number | null | undefined): void {
  if (week != null && Number.isInteger(week) && week >= 1 && week <= 53) {
    activeYearStartWeek = week;
  } else {
    activeYearStartWeek = DEFAULT_YEAR_START_WEEK;
  }
}

export function getSchoolYearStartWeek(): number {
  return activeYearStartWeek;
}

/**
 * School-year sort: weeks from yearStart through 53, then 1..(yearStart-1).
 * Eksempel startuke 32: 32…53, deretter 1…31.
 */
export function schoolYearRank(uke: number, yearStartWeek = activeYearStartWeek): number {
  return uke >= yearStartWeek ? uke : uke + 100;
}

export function compareSchoolYear(
  a: number,
  b: number,
  yearStartWeek = activeYearStartWeek
): number {
  return schoolYearRank(a, yearStartWeek) - schoolYearRank(b, yearStartWeek);
}

export type EffectiveUkeStatus = "teaching" | "locked" | "empty";

export interface EffectiveUke {
  uke: number;
  status: EffectiveUkeStatus;
  kapittelNummer: number | null;
  /** Kapittel i grunnplanen (før forskyvning), hvis uken fantes der. */
  baseKapittelNummer: number | null;
  maned: string;
  periodeFokus: string;
  endret: boolean;
  /** Lærer har tilpasset yrke, grammatikk og/eller manuelt tema for uken */
  tilpasset: boolean;
  overrideYrke?: string;
  overrideGrammatikk?: string;
  overrideTema?: string;
  overrideFokus?: string;
}

export interface EffectiveSchedule {
  uker: EffectiveUke[];
  lockedWeeks: number[];
  hasChanges: boolean;
  weekOverrides: Record<string, WeekFieldOverride>;
}

interface MutableSlot {
  uke: number;
  kapittelNummer: number | null;
  baseKapittelNummer: number | null;
  maned: string;
  periodeFokus: string;
  locked: boolean;
}

function baseSlots(plan: ArsplanDokument): MutableSlot[] {
  const rows = [...plan.uker].sort((a, b) => compareSchoolYear(a.uke, b.uke));
  return rows.map((row) => ({
    uke: row.uke,
    kapittelNummer: row.kapittel,
    baseKapittelNummer: row.kapittel,
    maned: row.maned,
    periodeFokus: row.periodeFokus,
    locked: false
  }));
}

function ensureSlot(slots: MutableSlot[], uke: number): MutableSlot {
  const existing = slots.find((s) => s.uke === uke);
  if (existing) return existing;
  const created: MutableSlot = {
    uke,
    kapittelNummer: null,
    baseKapittelNummer: null,
    maned: "",
    periodeFokus: "Låst uke / ferie",
    locked: false
  };
  slots.push(created);
  slots.sort((a, b) => compareSchoolYear(a.uke, b.uke));
  return created;
}

function nextSchoolWeek(uke: number): number {
  if (uke >= 53) return 1;
  return uke + 1;
}

function unlockedFrom(slots: MutableSlot[], fromUke: number): MutableSlot[] {
  return slots
    .filter((s) => !s.locked && schoolYearRank(s.uke) >= schoolYearRank(fromUke))
    .sort((a, b) => compareSchoolYear(a.uke, b.uke));
}

function extendUnlockedSlots(slots: MutableSlot[], fromUke: number, needed: number): void {
  let guard = 0;
  while (unlockedFrom(slots, fromUke).length < needed && guard < 80) {
    const last = [...slots].sort((a, b) => compareSchoolYear(a.uke, b.uke)).at(-1);
    let candidate = last ? nextSchoolWeek(last.uke) : fromUke;
    let hops = 0;
    while (slots.some((s) => s.uke === candidate) && hops < 60) {
      candidate = nextSchoolWeek(candidate);
      hops += 1;
    }
    const created = ensureSlot(slots, candidate);
    if (!created.maned) created.maned = "Forlenget";
    if (!created.periodeFokus) created.periodeFokus = "Forskyvet plan";
    guard += 1;
  }
}

function applyLock(slots: MutableSlot[], uke: number): void {
  ensureSlot(slots, uke);
  const affected = slots
    .filter((s) => schoolYearRank(s.uke) >= schoolYearRank(uke))
    .sort((a, b) => compareSchoolYear(a.uke, b.uke));

  const contents: number[] = [];
  for (const s of affected) {
    if (s.kapittelNummer != null && (!s.locked || s.uke === uke)) {
      contents.push(s.kapittelNummer);
    }
    if (!s.locked || s.uke === uke) {
      s.kapittelNummer = null;
    }
  }

  const slot = slots.find((s) => s.uke === uke)!;
  slot.locked = true;
  slot.kapittelNummer = null;
  if (!slot.periodeFokus) slot.periodeFokus = "Låst uke / ferie";

  extendUnlockedSlots(slots, uke, contents.length);
  const targets = unlockedFrom(slots, uke);
  for (let i = 0; i < contents.length && i < targets.length; i += 1) {
    targets[i].kapittelNummer = contents[i];
  }
}

function applyUnlock(slots: MutableSlot[], uke: number): void {
  const slot = slots.find((s) => s.uke === uke);
  if (!slot) return;
  slot.locked = false;
}

/**
 * Move teaching content forward by `weeks` unlocked slots, starting at fromUke.
 * The first `weeks` unlocked slots from fromUke become empty (innhenting).
 */
function applyShift(slots: MutableSlot[], fromUke: number, weeks: number): void {
  const preview = unlockedFrom(slots, fromUke);
  const contents = preview.map((s) => s.kapittelNummer);
  const needed = contents.filter((c) => c != null).length + weeks;
  extendUnlockedSlots(slots, fromUke, needed);
  const targets = unlockedFrom(slots, fromUke);
  if (!targets.length || weeks < 1) return;
  for (const s of targets) s.kapittelNummer = null;
  for (let i = 0; i < contents.length; i += 1) {
    const dest = i + weeks;
    if (dest >= targets.length) break;
    targets[dest].kapittelNummer = contents[i];
  }
}

function replay(plan: ArsplanDokument, state: PlanState): MutableSlot[] {
  let slots = baseSlots(plan);
  for (const op of state.operations) {
    if (op.type === "reset") {
      slots = baseSlots(plan);
      continue;
    }
    if (op.type === "lock") {
      applyLock(slots, op.uke);
      continue;
    }
    if (op.type === "unlock") {
      applyUnlock(slots, op.uke);
      continue;
    }
    if (op.type === "shift") {
      applyShift(slots, op.fromUke, op.weeks);
    }
  }
  return slots;
}

export function lockedWeeksFromState(state: PlanState): number[] {
  const locked = new Set<number>();
  for (const op of state.operations) {
    if (op.type === "reset") {
      locked.clear();
      continue;
    }
    if (op.type === "lock") locked.add(op.uke);
    if (op.type === "unlock") locked.delete(op.uke);
  }
  return [...locked].sort(compareSchoolYear);
}

/** Fold field overrides (yrke/grammatikk/tema) from the operation log. */
export function foldWeekOverrides(state: PlanState): Map<number, WeekFieldOverride> {
  const map = new Map<number, WeekFieldOverride>();
  for (const op of state.operations) {
    if (op.type === "reset") {
      map.clear();
      continue;
    }
    if (op.type === "clearWeekOverride") {
      map.delete(op.uke);
      continue;
    }
    if (op.type !== "overrideWeek") continue;
    const cur: WeekFieldOverride = { ...(map.get(op.uke) ?? {}) };
    if ("yrke" in op) {
      if (op.yrke == null || op.yrke === "") delete cur.yrke;
      else cur.yrke = op.yrke;
    }
    if ("grammatikk" in op) {
      if (op.grammatikk == null || op.grammatikk === "") delete cur.grammatikk;
      else cur.grammatikk = op.grammatikk;
    }
    if ("tema" in op) {
      if (op.tema == null || op.tema === "") delete cur.tema;
      else cur.tema = op.tema;
    }
    if ("fokus" in op) {
      if (op.fokus == null || op.fokus === "") delete cur.fokus;
      else cur.fokus = op.fokus;
    }
    if (!cur.yrke && !cur.grammatikk && !cur.tema && !cur.fokus) map.delete(op.uke);
    else map.set(op.uke, cur);
  }
  return map;
}

export function computeEffectiveSchedule(
  plan: ArsplanDokument,
  state: PlanState = emptyPlanState()
): EffectiveSchedule {
  const baseByUke = new Map(plan.uker.map((u) => [u.uke, u.kapittel]));
  const slots = replay(plan, state);
  const lockedWeeks = lockedWeeksFromState(state);
  const overrides = foldWeekOverrides(state);

  const uker: EffectiveUke[] = slots.map((s) => {
    const baseKap = baseByUke.get(s.uke) ?? null;
    let status: EffectiveUkeStatus = "teaching";
    if (s.locked) status = "locked";
    else if (s.kapittelNummer == null) status = "empty";

    const ov = overrides.get(s.uke);
    const tilpasset = Boolean(ov?.yrke || ov?.grammatikk || ov?.tema || ov?.fokus);
    const endret = s.locked || s.kapittelNummer !== baseKap || tilpasset;

    return {
      uke: s.uke,
      status,
      kapittelNummer: s.locked ? null : s.kapittelNummer,
      baseKapittelNummer: baseKap,
      maned: s.maned,
      periodeFokus: ov?.fokus ?? s.periodeFokus,
      endret,
      tilpasset,
      overrideYrke: ov?.yrke,
      overrideGrammatikk: ov?.grammatikk,
      overrideTema: ov?.tema,
      overrideFokus: ov?.fokus
    };
  });

  const weekOverrides: Record<string, WeekFieldOverride> = {};
  for (const [uke, ov] of overrides) {
    weekOverrides[String(uke)] = ov;
  }

  const meaningfulOps = state.operations.filter((op) => op.type !== "reset");
  return {
    uker,
    lockedWeeks,
    hasChanges: meaningfulOps.length > 0,
    weekOverrides
  };
}

export function appendOperation(state: PlanState, op: PlanOperation): PlanState {
  const nextOps = op.type === "reset" ? [op] : [...state.operations, op];
  return {
    version: 1,
    operations: nextOps,
    updatedAt: op.at
  };
}
