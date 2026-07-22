import { describe, expect, it } from "vitest";
import type { ArsplanDokument } from "../schemas/planlegging.js";
import { appendOperation, computeEffectiveSchedule } from "./planSchedule.js";
import { emptyPlanState } from "./planState.js";

function miniPlan(): ArsplanDokument {
  return {
    metadata: { tittel: "Test" },
    perioder: [
      {
        maned: "Oktober",
        ukeStart: 40,
        ukeSlutt: 43,
        uker: [40, 41, 42, 43],
        kapitler: [4, 5],
        fokus: "Test"
      }
    ],
    uker: [
      { uke: 40, kapittel: 4, maned: "Oktober", periodeFokus: "Test" },
      { uke: 41, kapittel: 5, maned: "Oktober", periodeFokus: "Test" },
      { uke: 42, kapittel: 5, maned: "Oktober", periodeFokus: "Test" },
      { uke: 43, kapittel: 6, maned: "Oktober", periodeFokus: "Test" }
    ],
    kapitler: []
  };
}

describe("planSchedule", () => {
  it("forskyver innhold fremover og hopper over låste uker", () => {
    let state = emptyPlanState("t0");
    state = appendOperation(state, { type: "lock", uke: 42, at: "t1", note: "Høstferie" });
    state = appendOperation(state, { type: "shift", fromUke: 40, weeks: 1, at: "t2" });

    const eff = computeEffectiveSchedule(miniPlan(), state);
    const byUke = new Map(eff.uker.map((u) => [u.uke, u]));

    expect(byUke.get(42)?.status).toBe("locked");
    expect(byUke.get(40)?.status).toBe("empty");
    expect(byUke.get(41)?.kapittelNummer).toBe(4);
    // Etter lås av 42 lå kap 5+6 på 43+; etter shift +1: 43 får 5 (fra 41-kjeden)
    expect(byUke.get(43)?.kapittelNummer).toBe(5);
    expect(eff.lockedWeeks).toContain(42);
  });

  it("reset tilbakestiller til grunnplan", () => {
    let state = emptyPlanState("t0");
    state = appendOperation(state, { type: "shift", fromUke: 40, weeks: 2, at: "t1" });
    state = appendOperation(state, { type: "reset", at: "t2" });
    const eff = computeEffectiveSchedule(miniPlan(), state);
    expect(eff.uker.find((u) => u.uke === 40)?.kapittelNummer).toBe(4);
    expect(eff.hasChanges).toBe(false);
  });
});
