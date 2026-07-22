import { type Response, Router } from "express";
import { z } from "zod";
import { env } from "../lib/config.js";
import { getPlanStoreMeta } from "../lib/planStore.js";
import { AdminAuthError, requireAdmin } from "../lib/requireAdmin.js";
import {
  addRecipient,
  deactivateByUnsubscribeToken,
  loadRecipientsState,
  publicRecipients,
  removeRecipient
} from "../lib/recipientsStore.js";

export const recipientsRouter = Router();

recipientsRouter.get("/recipients", async (req, res) => {
  try {
    requireAdmin(req);
    const state = await loadRecipientsState();
    res.json({
      success: true,
      recipients: publicRecipients(state),
      updatedAt: state.updatedAt,
      store: getPlanStoreMeta()
    });
  } catch (error) {
    handleError(res, error);
  }
});

const addSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional()
});

recipientsRouter.post("/recipients", async (req, res) => {
  try {
    requireAdmin(req);
    const body = addSchema.parse(req.body);
    const state = await addRecipient(body.email, body.name);
    res.json({
      success: true,
      recipients: publicRecipients(state),
      updatedAt: state.updatedAt
    });
  } catch (error) {
    handleError(res, error);
  }
});

const removeSchema = z.object({
  email: z.string().email()
});

recipientsRouter.delete("/recipients", async (req, res) => {
  try {
    requireAdmin(req);
    const body = removeSchema.parse(req.body);
    const state = await removeRecipient(body.email);
    res.json({
      success: true,
      recipients: publicRecipients(state),
      updatedAt: state.updatedAt
    });
  } catch (error) {
    handleError(res, error);
  }
});

/** One-click unsubscribe from email link */
recipientsRouter.get("/recipients/unsubscribe", async (req, res) => {
  try {
    const token = String(req.query.token ?? "");
    if (!token || token.length < 16) {
      res.status(400).type("html").send(unsubPage(false, "Ugyldig avmeldingslenke."));
      return;
    }
    const ok = await deactivateByUnsubscribeToken(token);
    if (!ok) {
      res.status(404).type("html").send(unsubPage(false, "Fant ikke mottaker, eller du er allerede avmeldt."));
      return;
    }
    res.type("html").send(unsubPage(true, "Du er avmeldt og vil ikke lenger motta ukentlige MBO-hefter."));
  } catch (error) {
    console.error("[recipients-unsubscribe]", error);
    res.status(500).type("html").send(unsubPage(false, "Noe gikk galt. Prøv igjen senere."));
  }
});

function unsubPage(ok: boolean, message: string): string {
  const title = ok ? "Avmeldt" : "Avmelding";
  return `<!doctype html>
<html lang="nb">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5;color:#123}</style>
</head>
<body>
  <h1>${title}</h1>
  <p>${message}</p>
  <p><small>Molde Voksenopplæring — MBO Automation</small></p>
</body>
</html>`;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, error: "Ugyldig input.", details: error.flatten() });
    return;
  }
  if (error instanceof AdminAuthError) {
    res.status(error.statusCode).json({ success: false, error: error.message });
    return;
  }
  const raw = error instanceof Error ? error.message : "Uventet feil.";
  console.error("[recipients-api]", raw);
  const status = /Turso|lagres på Vercel/i.test(raw) ? 503 : 500;
  res.status(status).json({
    success: false,
    error: status === 503 ? raw : env.NODE_ENV === "development" ? raw : "Uventet feil."
  });
}
