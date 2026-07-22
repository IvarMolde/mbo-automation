import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  adminAuthConfigured,
  createAdminSessionToken,
  isValidAdminCredential,
  verifyAdminPassword
} from "../lib/adminSession.js";
import { env } from "../lib/config.js";
import { getArsplan } from "../lib/arsplanResolve.js";
import { appendOperation, computeEffectiveSchedule } from "../lib/planSchedule.js";
import { getPlanStoreMeta, loadPlanState, savePlanState } from "../lib/planStore.js";

export const planRouter = Router();

function requireAdmin(req: Request): void {
  if (!adminAuthConfigured()) {
    throw new PlanApiError(503, "Admin-pålogging er ikke konfigurert på serveren.");
  }
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.header("x-admin-token") ?? "";
  if (!isValidAdminCredential(token)) {
    throw new PlanApiError(401, "Ikke innlogget eller ugyldig økt. Logg inn på nytt.");
  }
}

class PlanApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "PlanApiError";
  }
}

const loginSchema = z.object({
  password: z.string().min(1).max(200)
});

planRouter.post("/plan/login", (req, res) => {
  try {
    if (!adminAuthConfigured()) {
      throw new PlanApiError(503, "Admin-pålogging er ikke konfigurert på serveren.");
    }
    const body = loginSchema.parse(req.body);
    if (!verifyAdminPassword(body.password)) {
      throw new PlanApiError(401, "Feil passord.");
    }
    const sessionToken = createAdminSessionToken();
    if (!sessionToken) {
      throw new PlanApiError(503, "Kunne ikke opprette økt.");
    }
    res.json({
      success: true,
      sessionToken,
      expiresInDays: 30
    });
  } catch (error) {
    handlePlanError(res, error);
  }
});

planRouter.get("/plan", async (_req, res) => {
  try {
    const plan = getArsplan();
    if (!plan) {
      res.status(503).json({ success: false, error: "Årsplan mangler." });
      return;
    }
    const state = await loadPlanState();
    const effective = computeEffectiveSchedule(plan, state);
    const meta = getPlanStoreMeta();
    res.json({
      success: true,
      metadata: plan.metadata,
      perioder: plan.perioder,
      kapitler: plan.kapitler,
      baseUker: plan.uker,
      effective,
      state: {
        updatedAt: state.updatedAt,
        operations: state.operations
      },
      store: meta,
      auth: { configured: adminAuthConfigured() }
    });
  } catch (error) {
    handlePlanError(res, error);
  }
});

const lockSchema = z.object({
  uke: z.number().int().min(1).max(53),
  note: z.string().max(300).optional()
});

planRouter.post("/plan/lock", async (req, res) => {
  try {
    requireAdmin(req);
    const body = lockSchema.parse(req.body);
    const state = await loadPlanState();
    const next = appendOperation(state, {
      type: "lock",
      uke: body.uke,
      note: body.note,
      at: new Date().toISOString()
    });
    await savePlanState(next);
    res.json({ success: true, state: next, effective: scheduleSnapshot(next) });
  } catch (error) {
    handlePlanError(res, error);
  }
});

planRouter.post("/plan/unlock", async (req, res) => {
  try {
    requireAdmin(req);
    const body = lockSchema.pick({ uke: true }).parse(req.body);
    const state = await loadPlanState();
    const next = appendOperation(state, {
      type: "unlock",
      uke: body.uke,
      at: new Date().toISOString()
    });
    await savePlanState(next);
    res.json({ success: true, state: next, effective: scheduleSnapshot(next) });
  } catch (error) {
    handlePlanError(res, error);
  }
});

const shiftSchema = z.object({
  fromUke: z.number().int().min(1).max(53),
  weeks: z.number().int().min(1).max(20),
  note: z.string().max(300).optional()
});

planRouter.post("/plan/shift", async (req, res) => {
  try {
    requireAdmin(req);
    const body = shiftSchema.parse(req.body);
    const state = await loadPlanState();
    const next = appendOperation(state, {
      type: "shift",
      fromUke: body.fromUke,
      weeks: body.weeks,
      note: body.note,
      at: new Date().toISOString()
    });
    await savePlanState(next);
    res.json({ success: true, state: next, effective: scheduleSnapshot(next) });
  } catch (error) {
    handlePlanError(res, error);
  }
});

planRouter.post("/plan/reset", async (req, res) => {
  try {
    requireAdmin(req);
    const state = await loadPlanState();
    const next = appendOperation(state, {
      type: "reset",
      at: new Date().toISOString()
    });
    await savePlanState(next);
    res.json({ success: true, state: next, effective: scheduleSnapshot(next) });
  } catch (error) {
    handlePlanError(res, error);
  }
});

function scheduleSnapshot(state: Parameters<typeof computeEffectiveSchedule>[1]) {
  const plan = getArsplan();
  if (!plan) return null;
  return computeEffectiveSchedule(plan, state);
}

function handlePlanError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, error: "Ugyldig input.", details: error.flatten() });
    return;
  }
  if (error instanceof PlanApiError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }
  const raw = error instanceof Error ? error.message : "Uventet feil.";
  console.error("[plan-api]", raw);
  const status = /Turso|lagres på Vercel/i.test(raw) ? 503 : 500;
  res.status(status).json({
    success: false,
    error: status === 503 ? raw : env.NODE_ENV === "development" ? raw : "Uventet feil."
  });
}
