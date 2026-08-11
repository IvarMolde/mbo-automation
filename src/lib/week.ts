export function getIsoWeekNumber(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * ISO-uken for dato + 7 dager.
 * Brukes av onsdags-cron: send heftet for neste uke (forberedelse i forkant).
 */
export function getNextIsoWeekNumber(date: Date = new Date()): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  return getIsoWeekNumber(next);
}
