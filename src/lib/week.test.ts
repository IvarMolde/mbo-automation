import { describe, expect, it } from "vitest";
import { getIsoWeekNumber, getUpcomingSchoolWeek } from "./week.js";

describe("getIsoWeekNumber", () => {
  it("returns week 1 for first ISO week day", () => {
    expect(getIsoWeekNumber(new Date("2026-01-01T12:00:00Z"))).toBe(1);
  });

  it("returns correct week around year boundary", () => {
    expect(getIsoWeekNumber(new Date("2025-12-31T12:00:00Z"))).toBe(1);
    expect(getIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(53);
  });
});

describe("getUpcomingSchoolWeek", () => {
  it("sends next ISO week for mid-year Wednesday (school year lead time)", () => {
    // Wednesday in ISO week 31, 2026 — same numbering as Skoleår startWeek
    expect(getIsoWeekNumber(new Date("2026-07-29T12:00:00Z"))).toBe(31);
    expect(getUpcomingSchoolWeek(new Date("2026-07-29T12:00:00Z"))).toBe(32);
  });

  it("prepares first school week: Wednesday before startWeek 32 → week 32", () => {
    // If school year starts ISO week 32, cron on Wednesday of week 31 targets 32
    const wednesdayBeforeStart = new Date("2026-07-29T12:00:00Z");
    expect(getUpcomingSchoolWeek(wednesdayBeforeStart)).toBe(32);
  });

  it("wraps from week 53 to week 1 across year boundary", () => {
    expect(getIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(53);
    expect(getUpcomingSchoolWeek(new Date("2026-12-31T12:00:00Z"))).toBe(1);
  });
});
