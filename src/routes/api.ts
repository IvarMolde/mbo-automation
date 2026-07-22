import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { env } from "../lib/config.js";
import { sendHefte, sendMissingArsplanUkeEmail, sendTestEmail } from "../lib/emailSender.js";
import { genererArbeidshefte } from "../lib/gemini.js";
import { type Kapittel } from "../lib/types.js";
import { getIsoWeekNumber } from "../lib/week.js";
import { resolveKapittelForIsoUke } from "../lib/arsplanResolve.js";
import { loadPlanState } from "../lib/planStore.js";
import { listActiveRecipientEmails, loadRecipientsState } from "../lib/recipientsStore.js";
import { getAllKapitler, getKapittel } from "../lib/parser.js";
import { genererWordHefte } from "../lib/wordGenerator.js";
import {
  cronResponseSchema,
  errorResponseSchema,
  genererResponseSchema,
  genererSchema,
  sendSchema,
  successMessageResponseSchema,
  testEmailSchema
} from "../schemas/api.js";

export const apiRouter = Router();

apiRouter.get("/kapitler", (_req, res) => {
  res.json({ kapitler: getAllKapitler() });
});

apiRouter.post("/test-email", async (req, res) => {
  try {
    const { motaker } = testEmailSchema.parse(req.body);
    await sendTestEmail(motaker);
    sendValidatedJson(res, successMessageResponseSchema, { success: true, message: "Test-epost sendt." });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/generer", async (req, res) => {
  try {
    const { kapittelNummer, uke, overstyrKapittelNummer, laererTilleggsinstruks } = genererSchema.parse(req.body);
    const kapittel = resolveKapittelFromRequest({ kapittelNummer, uke, overstyrKapittelNummer });
    const files = await genererFilerForKapittel(kapittel, uke, { laererTilleggsinstruks });

    sendValidatedJson(res, genererResponseSchema, {
      success: true,
      kapittel: kapittel.nummer,
      uke,
      contentSource: files.contentSource,
      geminiError: files.contentSource === "fallback" ? sanitizeGeminiError(files.geminiError) : undefined,
      files: { wordBytes: files.word.length }
    });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/send", async (req, res) => {
  try {
    const { kapittelNummer, uke, overstyrKapittelNummer, laererTilleggsinstruks, motaker } = sendSchema.parse(req.body);
    const kapittel = resolveKapittelFromRequest({ kapittelNummer, uke, overstyrKapittelNummer });
    const files = await genererFilerForKapittel(kapittel, uke, { laererTilleggsinstruks });
    await sendHefte(motaker, kapittel, files.word, uke);

    sendValidatedJson(res, successMessageResponseSchema, {
      success: true,
      message: files.contentSource === "gemini"
        ? "Hefte sendt (generert med Gemini)."
        : "Hefte sendt (fallback — Gemini feilet; sjekk Vercel Logs).",
      contentSource: files.contentSource,
      geminiError: files.contentSource === "fallback" ? sanitizeGeminiError(files.geminiError) : undefined
    });
  } catch (error) {
    handleError(res, error);
  }
});

/** Vercel Cron bruker GET; manuell kjøring kan bruke POST. Samme sikkerhetssjekk. */
const cronHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!env.CRON_SECRET) {
      throw new ApiError(500, "CRON_SECRET er ikke konfigurert.");
    }
    const auth = req.header("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      throw new ApiError(401, "Ugyldig authorization token.");
    }

    const recipients = await listActiveRecipientEmails();
    if (recipients.length === 0) {
      throw new ApiError(500, "Ingen aktive e-postmottakere. Legg til mottakere under Admin, eller sett RECIPIENT_EMAIL.");
    }
    const recipientState = await loadRecipientsState();
    const tokenByEmail = new Map(
      recipientState.recipients.map((r) => [r.email, r.unsubscribeToken] as const)
    );

    const uke = getIsoWeekNumber(new Date());
    await loadPlanState();
    const resolution = resolveKapittelForIsoUke(uke);
    if (resolution.type === "mangler_uke") {
      for (const email of recipients) {
        await sendMissingArsplanUkeEmail(email, resolution.isoUke, {
          unsubscribeToken: tokenByEmail.get(email)
        });
      }
      throw new ApiError(503, `Mangler årsplan-rad for ISO-uke ${resolution.isoUke}. Ingen hefte sendt.`);
    }
    if (resolution.type === "laast_uke") {
      throw new ApiError(503, `ISO-uke ${resolution.isoUke} er låst (ferie). Ingen hefte sendt.`);
    }
    if (resolution.type === "tom_uke") {
      throw new ApiError(503, `ISO-uke ${resolution.isoUke} er tom etter forskyvning. Ingen hefte sendt.`);
    }
    const kapittel = resolution.kapittel;
    const files = await genererFilerForKapittel(kapittel, uke);
    for (const email of recipients) {
      await sendHefte(email, kapittel, files.word, uke, {
        unsubscribeToken: tokenByEmail.get(email)
      });
    }

    sendValidatedJson(res, cronResponseSchema, {
      success: true,
      message: files.contentSource === "gemini"
        ? "Cron-kjoring fullfort."
        : "Cron-kjoring fullfort med fallback (Gemini feilet).",
      kapittel: kapittel.nummer,
      uke,
      contentSource: files.contentSource,
      recipients: recipients.length
    });
  } catch (error) {
    handleError(res, error);
  }
};

apiRouter.get("/cron", cronHandler);
apiRouter.post("/cron", cronHandler);

class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Precedence: overstyrKapittelNummer → kapittelNummer (manuell) → årsplan for ISO-uke.
 */
function resolveKapittelFromRequest(body: {
  kapittelNummer?: number;
  uke: number;
  overstyrKapittelNummer?: number;
}): Kapittel {
  const { kapittelNummer, overstyrKapittelNummer, uke } = body;
  if (overstyrKapittelNummer != null) {
    const k = getKapittel(overstyrKapittelNummer);
    if (!k) {
      throw new ApiError(404, "Kapittel ikke funnet (overstyrKapittelNummer).");
    }
    return k;
  }
  if (kapittelNummer != null) {
    const k = getKapittel(kapittelNummer);
    if (!k) {
      throw new ApiError(404, "Kapittel ikke funnet.");
    }
    return k;
  }
  const resolution = resolveKapittelForIsoUke(uke);
  if (resolution.type === "mangler_uke") {
    throw new ApiError(503, `Mangler årsplan-rad for ISO-uke ${resolution.isoUke}.`);
  }
  if (resolution.type === "laast_uke") {
    throw new ApiError(503, `ISO-uke ${resolution.isoUke} er låst (ferie).`);
  }
  if (resolution.type === "tom_uke") {
    throw new ApiError(503, `ISO-uke ${resolution.isoUke} er tom etter forskyvning.`);
  }
  return resolution.kapittel;
}

async function genererFilerForKapittel(
  kapittel: Kapittel,
  uke: number,
  opts?: { laererTilleggsinstruks?: string }
): Promise<{
  word: Buffer;
  contentSource: "gemini" | "fallback";
  geminiError?: string;
}> {
  const generated = await genererArbeidshefte(kapittel, { laererTilleggsinstruks: opts?.laererTilleggsinstruks });
  const word = await genererWordHefte(kapittel, generated.data, uke);
  return {
    word,
    contentSource: generated.source,
    geminiError: generated.errorMessage
  };
}

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    sendValidatedJson(res.status(400), errorResponseSchema, {
      success: false,
      error: "Ugyldig input.",
      details: error.flatten()
    });
    return;
  }

  if (error instanceof ApiError) {
    sendValidatedJson(res.status(error.statusCode), errorResponseSchema, {
      success: false,
      error: error.message
    });
    return;
  }

  // Always log server-side (visible in Vercel Runtime Logs); never echo secrets.
  if (error instanceof Error) {
    console.error("[api]", error.message);
  } else {
    console.error("[api]", error);
  }

  const raw = error instanceof Error ? error.message : "";
  const isConfigHint =
    /GMAIL_USER|GMAIL_APP_PASSWORD|RECIPIENT_EMAIL|CRON_SECRET|GOOGLE_SERVICE_ACCOUNT/i.test(raw);
  const isMailAuth =
    /Invalid login|EAUTH|Username and Password not accepted|BadCredentials/i.test(raw);

  let clientMessage = "Uventet feil.";
  if (env.NODE_ENV === "development" && raw) {
    clientMessage = raw;
  } else if (isConfigHint) {
    clientMessage = "Mangler eller ugyldig e-postkonfigurasjon (GMAIL_USER / GMAIL_APP_PASSWORD).";
  } else if (isMailAuth) {
    clientMessage = "Gmail avviste innlogging. Sjekk App Password (uten mellomrom) og 2FA.";
  }

  sendValidatedJson(res.status(500), errorResponseSchema, {
    success: false,
    error: clientMessage
  });
}

function sendValidatedJson<T>(res: Response, schema: z.ZodType<T>, payload: T): void {
  const parsedPayload = schema.parse(payload);
  res.json(parsedPayload);
}

/** Strip secrets/paths from Vertex errors before returning to clients. */
function sanitizeGeminiError(message: string | undefined): string | undefined {
  if (!message) return "Ukjent Gemini-feil (ingen melding).";
  return message
    .replace(/-----BEGIN[\s\S]*?-----END [^-]+-----/g, "[REDACTED_KEY]")
    .replace(/private_key[^,]*/gi, "private_key:[REDACTED]")
    .slice(0, 1500);
}
