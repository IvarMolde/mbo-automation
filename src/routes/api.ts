import { type Response, Router } from "express";
import { z } from "zod";
import { env } from "../lib/config.js";
import { sendHefte, sendTestEmail } from "../lib/emailSender.js";
import { genererArbeidshefte, genererPresentasjon } from "../lib/gemini.js";
import { getAllKapitler, getKapittel, getKapittelForUke } from "../lib/parser.js";
import { genererPPTX } from "../lib/pptxGenerator.js";
import { genererWordHefte } from "../lib/wordGenerator.js";
import { genererSchema, sendSchema, testEmailSchema } from "../schemas/api.js";

export const apiRouter = Router();

apiRouter.get("/kapitler", (_req, res) => {
  res.json({ kapitler: getAllKapitler() });
});

apiRouter.post("/test-email", async (req, res) => {
  try {
    const { motaker } = testEmailSchema.parse(req.body);
    await sendTestEmail(motaker);
    res.json({ success: true, message: "Test-epost sendt." });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/generer", async (req, res) => {
  try {
    const { kapittelNummer, uke } = genererSchema.parse(req.body);
    const kapittel = getKapittel(kapittelNummer);
    if (!kapittel) {
      res.status(404).json({ success: false, error: "Kapittel ikke funnet." });
      return;
    }

    const arbeidshefte = await genererArbeidshefte(kapittel);
    const presentasjon = await genererPresentasjon(kapittel, arbeidshefte);
    const word = await genererWordHefte(kapittel, arbeidshefte, uke);
    const pptx = await genererPPTX(kapittel, presentasjon, uke);

    res.json({
      success: true,
      kapittel: kapittel.nummer,
      uke,
      files: { wordBytes: word.length, pptxBytes: pptx.length }
    });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/send", async (req, res) => {
  try {
    const { kapittelNummer, uke, motaker } = sendSchema.parse(req.body);
    const kapittel = getKapittel(kapittelNummer);
    if (!kapittel) {
      res.status(404).json({ success: false, error: "Kapittel ikke funnet." });
      return;
    }

    const arbeidshefte = await genererArbeidshefte(kapittel);
    const presentasjon = await genererPresentasjon(kapittel, arbeidshefte);
    const word = await genererWordHefte(kapittel, arbeidshefte, uke);
    const pptx = await genererPPTX(kapittel, presentasjon, uke);
    await sendHefte(motaker, kapittel, word, pptx, uke);

    res.json({ success: true, message: "Hefte sendt." });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post("/cron", async (req, res) => {
  try {
    if (!env.CRON_SECRET) {
      throw new Error("CRON_SECRET er ikke konfigurert.");
    }
    const auth = req.header("authorization");
    if (auth !== `Bearer ${env.CRON_SECRET}`) {
      res.status(401).json({ success: false, error: "Ugyldig authorization token." });
      return;
    }

    if (!env.RECIPIENT_EMAIL) {
      throw new Error("RECIPIENT_EMAIL er ikke konfigurert.");
    }

    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const uke = Math.ceil((((now.getTime() - start.getTime()) / 86400000) + start.getDay() + 1) / 7);
    const kapittel = getKapittelForUke(uke);
    const arbeidshefte = await genererArbeidshefte(kapittel);
    const presentasjon = await genererPresentasjon(kapittel, arbeidshefte);
    const word = await genererWordHefte(kapittel, arbeidshefte, uke);
    const pptx = await genererPPTX(kapittel, presentasjon, uke);
    await sendHefte(env.RECIPIENT_EMAIL, kapittel, word, pptx, uke);

    res.json({ success: true, message: "Cron-kjoring fullfort.", kapittel: kapittel.nummer, uke });
  } catch (error) {
    handleError(res, error);
  }
});

function handleError(res: Response, error: unknown) {
  if (error instanceof z.ZodError) {
    res.status(400).json({ success: false, error: "Ugyldig input.", details: error.flatten() });
    return;
  }

  const message = error instanceof Error ? error.message : "Uventet feil.";
  res.status(500).json({ success: false, error: message });
}
