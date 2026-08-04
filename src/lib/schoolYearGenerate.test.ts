import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { arsplanDokumentSchema } from "../schemas/planlegging.js";
import {
  distributeChapters,
  generateSchoolYearPlan,
  holidayWeekSet,
  isoWeeksInRange,
  parseDateOnly
} from "./schoolYearGenerate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const plan = arsplanDokumentSchema.parse(
  JSON.parse(readFileSync(join(__dirname, "../../data/arsplan-2026-2027.json"), "utf8"))
);

describe("schoolYearGenerate", () => {
  it("parses date-only as UTC", () => {
    const d = parseDateOnly("2026-08-17");
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(17);
  });

  it("lists ISO weeks across autumn–spring school year", () => {
    const weeks = isoWeeksInRange("2026-08-17", "2027-06-18");
    expect(weeks[0]).toBeGreaterThanOrEqual(33);
    expect(weeks).toContain(34);
    expect(weeks).toContain(2);
    expect(weeks.at(-1)).toBeLessThanOrEqual(25);
  });

  it("maps holiday date ranges to week numbers", () => {
    const set = holidayWeekSet([
      { name: "Høstferie", startDate: "2026-10-05", endDate: "2026-10-09" }
    ]);
    expect(set.size).toBeGreaterThanOrEqual(1);
    expect([...set].every((w) => w >= 40 && w <= 42)).toBe(true);
  });

  it("distributes all chapters onto teaching weeks", () => {
    const teaching = isoWeeksInRange("2026-08-17", "2027-06-18").filter(
      (w) => ![40, 41, 52, 1, 8, 9].includes(w)
    );
    const rows = distributeChapters(teaching, plan, "2026-08-17", "2027-06-18");
    const withKap = rows.filter((r) => r.kapittel != null);
    expect(withKap.length).toBeGreaterThan(0);
    const nums = new Set(withKap.map((r) => r.kapittel));
    expect(nums.has(1)).toBe(true);
  });

  it("generateSchoolYearPlan locks holidays and assigns chapters", () => {
    const profile = generateSchoolYearPlan(
      {
        label: "Test 2026-2027",
        startDate: "2026-08-17",
        endDate: "2027-06-18",
        holidays: [
          { name: "Jul", startDate: "2026-12-21", endDate: "2027-01-02" },
          { name: "Vinter", startDate: "2027-02-15", endDate: "2027-02-19" }
        ]
      },
      plan
    );
    expect(profile.applied).toBe(true);
    expect(profile.holidayWeeks.length).toBeGreaterThan(0);
    expect(profile.generatedUker.some((u) => u.kapittel === 1)).toBe(true);
    expect(profile.generatedUker.every((u) => !profile.holidayWeeks.includes(u.uke))).toBe(true);
  });
});
