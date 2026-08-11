/**
 * ISO-ukenummer (1–53).
 * Samme ukenummerering som Skoleår-profilen: startDate → startWeek.
 */
export function getIsoWeekNumber(date: Date): number {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  return Math.ceil((((utcDate.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Kommende skoleuke = ISO-uken for dato + 7 dager.
 *
 * Brukes av onsdags-cron og henger sammen med Skoleår:
 * - Når du setter oppstart (f.eks. mandag i uke 32), er startuke ISO-uke 32.
 * - Onsdag i uke 31 sender derfor heftet for uke 32 (første undervisningsuke).
 * - Hver senere onsdag i uke N sender heftet for uke N+1 (alltid på forskudd).
 *
 * Årsskifte håndteres via dato + 7 dager (f.eks. uke 53 → 1).
 */
export function getUpcomingSchoolWeek(date: Date = new Date()): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
  return getIsoWeekNumber(next);
}

/** @deprecated Bruk getUpcomingSchoolWeek — samme funksjon, tydeligere navn. */
export function getNextIsoWeekNumber(date: Date = new Date()): number {
  return getUpcomingSchoolWeek(date);
}
