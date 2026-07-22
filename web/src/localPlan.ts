import {
  appendOperation,
  computeEffectiveSchedule,
  emptyPlanState,
  type PlanOperation,
  type PlanState
} from "./schedule";
import type { ArsplanDokument, EffectiveUke } from "./types";

const STORAGE_KEY = "mbo-plan-state-v1";

export function loadLocalPlanState(): PlanState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyPlanState();
    const parsed = JSON.parse(raw) as PlanState;
    if (parsed?.version !== 1 || !Array.isArray(parsed.operations)) {
      return emptyPlanState();
    }
    return parsed;
  } catch {
    return emptyPlanState();
  }
}

export function saveLocalPlanState(state: PlanState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function applyLocalOperation(plan: ArsplanDokument, op: PlanOperation): {
  state: PlanState;
  effective: EffectiveUke[];
} {
  const current = loadLocalPlanState();
  const next = appendOperation(current, op);
  saveLocalPlanState(next);
  return {
    state: next,
    effective: computeEffectiveSchedule(plan, next).uker
  };
}

export function getLocalEffectiveUker(plan: ArsplanDokument): EffectiveUke[] {
  return computeEffectiveSchedule(plan, loadLocalPlanState()).uker;
}
