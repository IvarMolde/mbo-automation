import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { env } from "../lib/config.js";
import { sendHefte, sendMissingArsplanUkeEmail, sendTestEmail } from "../lib/emailSender.js";
import { genererArbeidshefte, genererPresentasjon } from "../lib/gemini.js";
import { type Kapittel } from "../lib/types.js";
import { getIsoWeekNumber } from "../lib/week.js";
import { resolveKapittelForIsoUke } from "../lib/arsplanResolve.js";
import { getAllKapitler, getKapittel } from "../lib/parser.js";
import { genererPPTX } from "../lib/pptxGenerator.js";
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
      files: { wordBytes: files.word.length, pptxBytes: files.pptx.length }
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
    await sendHefte(motaker, kapittel, files.word, files.pptx, uke);

    sendValidatedJson(res, successMessageResponseSchema, { success: true, message: "Hefte sendt." });
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

    if (!env.RECIPIENT_EMAIL) {
      throw new ApiError(500, "RECIPIENT_EMAIL er ikke konfigurert.");
    }

    const uke = getIsoWeekNumber(new Date());
    const resolution = resolveKapittelForIsoUke(uke);
    if (resolution.type === "mangler_uke") {
      await sendMissingArsplanUkeEmail(env.RECIPIENT_EMAIL, resolution.isoUke);
      throw new ApiError(503, `Mangler årsplan-rad for ISO-uke ${resolution.isoUke}. Ingen hefte sendt.`);
    }
    const kapittel = resolution.kapittel;
    const files = await genererFilerForKapittel(kapittel, uke);
    await sendHefte(env.RECIPIENT_EMAIL, kapittel, files.word, files.pptx, uke);

    sendValidatedJson(res, cronResponseSchema, {
      success: true,
      message: "Cron-kjoring fullfort.",
      kapittel: kapittel.nummer,
      uke
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
  return resolution.kapittel;
}

async function genererFilerForKapittel(
  kapittel: Kapittel,
  uke: number,
  opts?: { laererTilleggsinstruks?: string }
): Promise<{ word: Buffer; pptx: Buffer }> {
  const arbeidshefte = await genererArbeidshefte(kapittel, { laererTilleggsinstruks: opts?.laererTilleggsinstruks });
  const presentasjon = await genererPresentasjon(kapittel, arbeidshefte);
  const word = await genererWordHefte(kapittel, arbeidshefte, uke);
  const pptx = await genererPPTX(kapittel, presentasjon, uke);
  return { word, pptx };
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
