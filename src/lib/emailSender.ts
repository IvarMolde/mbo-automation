import nodemailer from "nodemailer";
import { env } from "./config.js";
import type { Kapittel } from "./types.js";

export async function sendTestEmail(motaker: string): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: "MBO test-epost",
    html: "<p>Test-epost fra MBO-automatisering.</p>"
  });
}

export async function sendHefte(
  motaker: string,
  kapittel: Kapittel,
  wordBuffer: Buffer,
  pptxBuffer: Buffer,
  uke: number
): Promise<void> {
  const transporter = getTransporter();
  const base = `Kap_${String(kapittel.nummer).padStart(2, "0")}_${kapittel.yrke.replace(/\s+/g, "_")}_uke${uke}`;

  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: `MBO-hefte uke ${uke}: ${kapittel.yrke}`,
    html: `<p>Vedlagt finner du hefte og presentasjon for uke ${uke}.</p>`,
    attachments: [
      { filename: `${base}.docx`, content: wordBuffer },
      { filename: `${base}.pptx`, content: pptxBuffer }
    ]
  });
}

function getTransporter() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Mangler GMAIL_USER/GMAIL_APP_PASSWORD i miljøvariabler.");
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass: env.GMAIL_APP_PASSWORD
    }
  });
}
