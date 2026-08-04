import type { ArsplanDokument } from "../schemas/planlegging.js";
import {
  compareSchoolYear,
  schoolYearRank,
  setSchoolYearStartWeek
} from "./planSchedule.js";
import type {
  BreakSummary,
  GeneratedUke,
  Holiday,
  SchoolYearProfile
} from "./schoolYearState.js";

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

const MONTH_SHORT = [
  "jan.",
  "feb.",
  "mars",
  "apr.",
  "mai",
  "juni",
  "juli",
  "aug.",
  "sep.",
  "okt.",
  "nov.",
  "des."
] as const;

/** Minimum ukedager (man–fre) i en ferieperiode før skoleuken låses helt. */
const FULL_WEEK_WEEKDAY_THRESHOLD = 3;

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

export function formatDateNb(iso: string): string {
  const d = parseDateOnly(iso);
  return `${d.getUTCDate()}. ${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateRangeNb(startIso: string, endIso: string): string {
  if (startIso === endIso) return formatDateNb(startIso);
  const a = parseDateOnly(startIso);
  const b = parseDateOnly(endIso);
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.getUTCDate()}.–${b.getUTCDate()}. ${MONTH_SHORT[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  if (a.getUTCFullYear() === b.getUTCFullYear()) {
    return `${a.getUTCDate()}. ${MONTH_SHORT[a.getUTCMonth()]} – ${b.getUTCDate()}. ${MONTH_SHORT[b.getUTCMonth()]} ${a.getUTCFullYear()}`;
  }
  return `${formatDateNb(startIso)} – ${formatDateNb(endIso)}`;
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

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWeekday(date: Date): boolean {
  const dow = date.getUTCDay() || 7;
  return dow >= 1 && dow <= 5;
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
  return ordered.sort((a, b) => compareSchoolYear(a, b, getIsoWeekParts(start).week));
}

type WeekCoverage = { week: number; dates: string[]; weekdayCount: number };

/** Ukedager (man–fre) per skoleuke innenfor et datointervall. */
export function weekdayCoverageInRange(startIso: string, endIso: string): WeekCoverage[] {
  const start = parseDateOnly(startIso);
  const end = parseDateOnly(endIso);
  if (end.getTime() < start.getTime()) {
    throw new Error("Sluttdato må være etter startdato.");
  }
  const map = new Map<number, string[]>();
  let cursor = start;
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 450) {
    if (isWeekday(cursor)) {
      const { week } = getIsoWeekParts(cursor);
      const list = map.get(week) ?? [];
      list.push(toIsoDate(cursor));
      map.set(week, list);
    }
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return [...map.entries()]
    .map(([week, dates]) => ({ week, dates, weekdayCount: dates.length }))
    .sort((a, b) => compareSchoolYear(a.week, b.week));
}

/**
 * Lås bare skoleuker der ferieperioden dekker nok ukedager (≥ 3 man–fre).
 * Enkeltdager (kind=day) låser aldri uken.
 */
export function holidayWeekSet(holidays: Holiday[]): Set<number> {
  const set = new Set<number>();
  for (const h of holidays) {
    if ((h.kind ?? "period") === "day") continue;
    if (parseDateOnly(h.endDate).getTime() < parseDateOnly(h.startDate).getTime()) {
      throw new Error(`Ferie «${h.name}»: sluttdato før startdato.`);
    }
    for (const cov of weekdayCoverageInRange(h.startDate, h.endDate)) {
      if (cov.weekdayCount >= FULL_WEEK_WEEKDAY_THRESHOLD) {
        set.add(cov.week);
      }
    }
  }
  return set;
}

/** Presis oppsummering: hele ferieuker vs. enkeltdager / delvise dager. */
export function summarizeBreaks(holidays: Holiday[]): BreakSummary {
  const periods: BreakSummary["periods"] = [];
  const days: BreakSummary["days"] = [];

  for (const h of holidays) {
    const kind = h.kind ?? "period";
    if (kind === "day") {
      const date = h.startDate;
      const uke = getIsoWeekParts(parseDateOnly(date)).week;
      days.push({
        name: h.name,
        date,
        uke,
        label: `${h.name} ${formatDateNb(date)} (skoleuke ${uke} — uken har fortsatt undervisning)`
      });
      continue;
    }

    const coverage = weekdayCoverageInRange(h.startDate, h.endDate);
    const lockedWeeks = coverage
      .filter((c) => c.weekdayCount >= FULL_WEEK_WEEKDAY_THRESHOLD)
      .map((c) => c.week);
    const partialWeeks = coverage
      .filter((c) => c.weekdayCount > 0 && c.weekdayCount < FULL_WEEK_WEEKDAY_THRESHOLD)
      .map((c) => ({ uke: c.week, weekdayCount: c.weekdayCount, dates: c.dates }));

    const range = formatDateRangeNb(h.startDate, h.endDate);
    const parts: string[] = [`${h.name} ${range}`];
    if (lockedWeeks.length) {
      parts.push(`låser skoleuke ${lockedWeeks.join(", ")} (hel uke uten undervisning)`);
    }
    if (partialWeeks.length) {
      const partialText = partialWeeks
        .map(
          (p) =>
            `skoleuke ${p.uke} (${p.weekdayCount} fridag${p.weekdayCount > 1 ? "er" : ""} — uken fortsetter)`
        )
        .join("; ");
      parts.push(`delvis: ${partialText}`);
    }
    if (!lockedWeeks.length && !partialWeeks.length) {
      parts.push("ingen ukedager i perioden");
    }

    periods.push({
      name: h.name,
      startDate: h.startDate,
      endDate: h.endDate,
      lockedWeeks,
      partialWeeks,
      label: parts.join(" · ")
    });
  }

  return { periods, days };
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
  const startWeek = getIsoWeekParts(parseDateOnly(input.startDate)).week;
  setSchoolYearStartWeek(startWeek);

  const allWeeks = isoWeeksInRange(input.startDate, input.endDate);
  const holidaySet = holidayWeekSet(input.holidays);
  const holidayWeeks = [...holidaySet].sort((a, b) => compareSchoolYear(a, b, startWeek));
  const teachingWeeks = allWeeks.filter((w) => !holidaySet.has(w));
  const generatedUker = distributeChapters(teachingWeeks, plan, input.startDate, input.endDate);
  const breakSummary = summarizeBreaks(input.holidays);
  const now = new Date().toISOString();

  return {
    version: 1,
    label: input.label?.trim() || undefined,
    startDate: input.startDate,
    endDate: input.endDate,
    startWeek,
    holidays: input.holidays,
    holidayWeeks,
    breakSummary,
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
  const startWeek =
    profile.startWeek ?? getIsoWeekParts(parseDateOnly(profile.startDate)).week;
  setSchoolYearStartWeek(startWeek);

  const teachingRows = profile.generatedUker.filter((u) => u.kapittel != null);
  const uker = teachingRows.map((u) => ({
    uke: u.uke,
    kapittel: u.kapittel as number,
    maned: u.maned,
    periodeFokus: u.periodeFokus
  }));

  const perioder = buildPerioderFromGenerated(
    [
      ...profile.generatedUker,
      ...profile.holidayWeeks.map((uke) => ({
        uke,
        kapittel: null as number | null,
        maned: monthNameForWeek(uke, profile.startDate, profile.endDate),
        periodeFokus: "Ferie"
      }))
    ].sort((a, b) => compareSchoolYear(a.uke, b.uke, startWeek)),
    plan
  );

  return {
    ...plan,
    metadata: {
      ...plan.metadata,
      ...(profile.label ? { tittel: profile.label } : {}),
      skolear: profile.label || plan.metadata.skolear,
      periode: `${profile.startDate} – ${profile.endDate}`,
      notat: `Generert fra Skoleår-profil (starter skoleuke ${startWeek}).`
    },
    perioder,
    uker
  };
}
