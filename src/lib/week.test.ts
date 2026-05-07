import { describe, expect, it } from "vitest";
import { getIsoWeekNumber } from "./week.js";

describe("getIsoWeekNumber", () => {
  it("returns week 1 for first ISO week day", () => {
    expect(getIsoWeekNumber(new Date("2026-01-01T12:00:00Z"))).toBe(1);
  });

  it("returns correct week around year boundary", () => {
    expect(getIsoWeekNumber(new Date("2025-12-31T12:00:00Z"))).toBe(1);
    expect(getIsoWeekNumber(new Date("2026-12-31T12:00:00Z"))).toBe(53);
  });
});
