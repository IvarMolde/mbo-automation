import { describe, expect, it } from "vitest";
import { getIsoWeekNumber, getNextIsoWeekNumber } from "./week.js";

describe("getIsoWeekNumber", () => {
  it("returns week 1 for first ISO week day", () => {
    expect(getIsoWeekNumber(new Date("2026-01-01T12:00:00Z"))).toBe(1);
  });

  it("returns correct week around year boundary", () => {
    expect(getIsoWeekNumber(new Date("2025-12-31T12:00:00Z"))).toBe(1);
    expect(getIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(53);
  });
});

describe("getNextIsoWeekNumber", () => {
  it("returns next ISO week for a mid-year Wednesday", () => {
    // Wednesday in ISO week 31, 2026
    expect(getNextIsoWeekNumber(new Date("2026-07-29T12:00:00Z"))).toBe(32);
  });

  it("wraps from week 53 to week 1 across year boundary", () => {
    // Thursday 31 Dec 2026 is in ISO week 53; +7 days → week 1 of 2027
    expect(getIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(53);
    expect(getNextIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(1);
  });
});
