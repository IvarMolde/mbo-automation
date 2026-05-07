import { type Response, Router } from "express";
import { z } from "zod";
import { env } from "../lib/config.js";
import { sendHefte, sendTestEmail } from "../lib/emailSender.js";
import { genererArbeidshefte, genererPresentasjon } from "../lib/gemini.js";
import { type Kapittel } from "../lib/types.js";
import { getIsoWeekNumber } from "../lib/week.js";
import { getAllKapitler, getKapittel, getKapittelForUke } from "../lib/parser.js";
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
    const { kapittelNummer, uke } = genererSchema.parse(req.body);
    const kapittel = resolveKapittelOrThrow(kapittelNummer);
    const files = await genererFilerForKapittel(kapittel, uke);

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
    const { kapittelNummer, uke, motaker } = sendSchema.parse(req.body);
    const kapittel = resolveKapittelOrThrow(kapittelNummer);
    const files = await genererFilerForKapittel(kapittel, uke);
    await sendHefte(motaker, kapittel, files.word, files.pptx, uke);

    sendValidatedJson(res, successMessageResponseSchema, { success: true, message: "Hefte sendt." });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/cron", async (req, res) => {
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
    const kapittel = getKapittelForUke(uke);
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
});

class ApiError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

function resolveKapittelOrThrow(kapittelNummer: number): Kapittel {
  const kapittel = getKapittel(kapittelNummer);
  if (!kapittel) {
    throw new ApiError(404, "Kapittel ikke funnet.");
  }
  return kapittel;
}

async function genererFilerForKapittel(kapittel: Kapittel, uke: number): Promise<{ word: Buffer; pptx: Buffer }> {
  const arbeidshefte = await genererArbeidshefte(kapittel);
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

  const message = env.NODE_ENV === "development" && error instanceof Error
    ? error.message
    : "Uventet feil.";
  sendValidatedJson(res.status(500), errorResponseSchema, {
    success: false,
    error: message
  });
}

function sendValidatedJson<T>(res: Response, schema: z.ZodType<T>, payload: T): void {
  const parsedPayload = schema.parse(payload);
  res.json(parsedPayload);
}
