/** ISO week number (1–53), same logic as API / Skoleår startWeek. */
export function getIsoWeekNumber(date: Date = new Date()): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** Kommende skoleuke (dato + 7 dager) — samme regel som onsdags-cron. */
export function getUpcomingSchoolWeek(date: Date = new Date()): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  return getIsoWeekNumber(next);
}

export function getIsoWeekYear(date: Date = new Date()): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  return utcDate.getUTCFullYear();
}
