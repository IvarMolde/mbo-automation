import type { ArsplanDokument } from "../schemas/planlegging.js";
import { compareSchoolYear, schoolYearRank } from "./planSchedule.js";
import type { GeneratedUke, Holiday, SchoolYearProfile } from "./schoolYearState.js";

const MONTH_NB = [
  "Januar",
  "Februar",
  "Mars",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Desember"
] as const;

/** Parse YYYY-MM-DD as UTC midnight (stable across timezones). */
export function parseDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Ugyldig dato: ${iso}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Ugyldig dato: ${iso}`);
  }
  return dt;
}

export function getIsoWeekParts(date: Date): { year: number; week: number } {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year, week };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** All distinct ISO week numbers covered by [start, end] inclusive, school-year ordered. */
export function isoWeeksInRange(startIso: string, endIso: string): number[] {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (end.getTime() < start.getTime()) {
    throw new Error("Sluttdato må være etter startdato.");
  }
  const seen = new Set<number>();
  const ordered: number[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 450) {
    const { week } = getIsoWeekParts(cursor);
    if (!seen.has(week)) {
      seen.add(week);
      ordered.push(week);
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return ordered.sort(compareSchoolYear);
}

export function holidayWeekSet(holidays: Holiday[]): Set<number> {
  const set = new Set<number>();
  for (const h of holidays) {
    if (parseDateOnly(h.endDate).getTime() < parseDateOnly(h.startDate).getTime()) {
      throw new Error(`Ferie «${h.name}»: sluttdato før startdato.`);
    }
    for (const w of isoWeeksInRange(h.startDate, h.endDate)) {
      set.add(w);
    }
  }
  return set;
}

function monthNameForWeek(week: number, startIso: string, endIso: string): string {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  let cursor = start;
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 450) {
    const parts = getIsoWeekParts(cursor);
    if (parts.week === week) {
      return MONTH_NB[cursor.getUTCMonth()]!;
    }
    cursor = addDays(cursor, 7);
    guard += 1;
  }
  // Fallback: Thursday of ISO week in start year
  const year = getIsoWeekParts(start).year;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const week1Mon = addDays(jan4, 1 - day);
  const thursday = addDays(week1Mon, (week - 1) * 7 + 3);
  return MONTH_NB[thursday.getUTCMonth()]!;
}

function chapterDurations(plan: ArsplanDokument): Array<{ nummer: number; weeks: number; fokus: string }> {
  const sorted = [...plan.kapitler].sort((a, b) => a.nummer - b.nummer);
  return sorted.map((ch) => {
    const fromUker = ch.uker?.length ?? 0;
    const fromSpan =
      ch.ukeStart != null && ch.ukeSlutt != null
        ? Math.max(1, schoolYearRank(ch.ukeSlutt) - schoolYearRank(ch.ukeStart) + 1)
        : 0;
    const weeks = Math.max(1, fromUker || fromSpan || 1);
    return { nummer: ch.nummer, weeks, fokus: ch.periodeFokus || ch.tittel || "" };
  });
}

/**
 * Fordel kapitler på undervisningsuker (beholder relativ varighet fra katalogen).
 * Mangler uker → komprimer til 1 uke per kapittel. Ekstra uker → tomme (null kapittel).
 */
export function distributeChapters(
  teachingWeeks: number[],
  plan: ArsplanDokument,
  startDate: string,
  endDate: string
): GeneratedUke[] {
  const chapters = chapterDurations(plan);
  const totalNeed = chapters.reduce((s, c) => s + c.weeks, 0);
  let durations = chapters.map((c) => c.weeks);

  if (teachingWeeks.length < chapters.length) {
    durations = chapters.map((_, i) => (i < teachingWeeks.length ? 1 : 0));
  } else if (teachingWeeks.length < totalNeed) {
    durations = chapters.map(() => 1);
    let remaining = teachingWeeks.length - chapters.length;
    while (remaining > 0) {
      let given = false;
      for (let i = 0; i < chapters.length && remaining > 0; i += 1) {
        if (durations[i]! < chapters[i]!.weeks) {
          durations[i]! += 1;
          remaining -= 1;
          given = true;
        }
      }
      if (!given) {
        for (let i = 0; i < chapters.length && remaining > 0; i += 1) {
          durations[i]! += 1;
          remaining -= 1;
        }
      }
    }
  }

  const result: GeneratedUke[] = [];
  let weekIdx = 0;
  for (let ci = 0; ci < chapters.length; ci += 1) {
    const dur = durations[ci] ?? 0;
    if (dur <= 0) continue;
    const ch = chapters[ci]!;
    for (let d = 0; d < dur && weekIdx < teachingWeeks.length; d += 1) {
      const uke = teachingWeeks[weekIdx]!;
      result.push({
        uke,
        kapittel: ch.nummer,
        maned: monthNameForWeek(uke, startDate, endDate),
        periodeFokus: ch.fokus
      });
      weekIdx += 1;
    }
  }
  while (weekIdx < teachingWeeks.length) {
    const uke = teachingWeeks[weekIdx]!;
    result.push({
      uke,
      kapittel: null,
      maned: monthNameForWeek(uke, startDate, endDate),
      periodeFokus: "Ledig undervisningsuke"
    });
    weekIdx += 1;
  }
  return result.sort((a, b) => compareSchoolYear(a.uke, b.uke));
}

export function generateSchoolYearPlan(
  input: {
    label?: string;
    startDate: string;
    endDate: string;
    holidays: Holiday[];
  },
  plan: ArsplanDokument
): SchoolYearProfile {
  const allWeeks = isoWeeksInRange(input.startDate, input.endDate);
  const holidaySet = holidayWeekSet(input.holidays);
  const holidayWeeks = [...holidaySet].sort(compareSchoolYear);
  const teachingWeeks = allWeeks.filter((w) => !holidaySet.has(w));
  const generatedUker = distributeChapters(teachingWeeks, plan, input.startDate, input.endDate);
  const now = new Date().toISOString();

  return {
    version: 1,
    label: input.label?.trim() || undefined,
    startDate: input.startDate,
    endDate: input.endDate,
    holidays: input.holidays,
    holidayWeeks,
    generatedUker,
    applied: true,
    appliedAt: now,
    updatedAt: now
  };
}

/** Bygg perioder-gruppering for UI fra genererte uker. */
export function buildPerioderFromGenerated(
  generatedUker: GeneratedUke[],
  plan: ArsplanDokument
): ArsplanDokument["perioder"] {
  const byMonth = new Map<string, GeneratedUke[]>();
  for (const u of generatedUker) {
    const list = byMonth.get(u.maned) ?? [];
    list.push(u);
    byMonth.set(u.maned, list);
  }
  const perioder: ArsplanDokument["perioder"] = [];
  for (const [maned, uker] of byMonth) {
    const sorted = [...uker].sort((a, b) => compareSchoolYear(a.uke, b.uke));
    const weekNums = sorted.map((u) => u.uke);
    const kapitler = [
      ...new Set(sorted.map((u) => u.kapittel).filter((k): k is number => k != null))
    ];
    const fokus =
      sorted.find((u) => u.periodeFokus)?.periodeFokus ||
      plan.perioder.find((p) => p.maned === maned)?.fokus ||
      "";
    perioder.push({
      maned,
      ukeStart: weekNums[0] ?? 1,
      ukeSlutt: weekNums.at(-1) ?? 1,
      uker: weekNums,
      kapitler,
      fokus
    });
  }
  return perioder;
}

/**
 * Overlay: bytt ut uker/perioder i årsplanen med generert skoleår-profil.
 * Kapittelkatalogen beholdes.
 */
export function applyProfileToArsplan(
  plan: ArsplanDokument,
  profile: SchoolYearProfile | null
): ArsplanDokument {
  if (!profile?.applied || !profile.generatedUker.length) {
    return plan;
  }
  const teachingRows = profile.generatedUker.filter((u) => u.kapittel != null);
  const uker = teachingRows.map((u) => ({
    uke: u.uke,
    kapittel: u.kapittel as number,
    maned: u.maned,
    periodeFokus: u.periodeFokus
  }));
  // Include holiday weeks as locked-ready slots without chapter (for calendar completeness)
  const holidayRows = profile.holidayWeeks
    .filter((w) => !uker.some((u) => u.uke === w))
    .map((uke) => ({
      uke,
      kapittel: 0, // placeholder — locks will clear; use ensure via lock ops
      maned: monthNameForWeek(uke, profile.startDate, profile.endDate),
      periodeFokus: "Ferie"
    }));

  // Don't put kapittel:0 in base — only teaching weeks in uker array (matches original model)
  // Holidays appear via lock operations.
  void holidayRows;

  const perioder = buildPerioderFromGenerated(
    [
      ...profile.generatedUker,
      ...profile.holidayWeeks.map((uke) => ({
        uke,
        kapittel: null as number | null,
        maned: monthNameForWeek(uke, profile.startDate, profile.endDate),
        periodeFokus: "Ferie"
      }))
    ].sort((a, b) => compareSchoolYear(a.uke, b.uke)),
    plan
  );

  return {
    ...plan,
    metadata: {
      ...plan.metadata,
      ...(profile.label ? { tittel: profile.label } : {}),
      skolear: profile.label || plan.metadata.skolear,
      periode: `${profile.startDate} – ${profile.endDate}`,
      notat: "Generert fra Skoleår-profil (start, slutt og ferier)."
    },
    perioder,
    uker
  };
}
