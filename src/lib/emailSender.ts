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
  uke: number
): Promise<void> {
  const transporter = getTransporter();
  const base = `Kap_${String(kapittel.nummer).padStart(2, "0")}_${kapittel.yrke.replace(/\s+/g, "_")}_uke${uke}`;

  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: `MBO-hefte uke ${uke}: ${kapittel.yrke}`,
    html: `<p>Vedlagt finner du arbeidsheftet for uke ${uke}.</p>`,
    attachments: [{ filename: `${base}.docx`, content: wordBuffer }]
  });
}

export async function sendMissingArsplanUkeEmail(motaker: string, isoUke: number): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: `MBO: mangler årsplan for ISO-uke ${isoUke}`,
    html: `<p>Den automatiske ukentlige jobben fant ingen rad for ISO-uke <strong>${isoUke}</strong> i den innleste årsplanen.</p>
<p>Ingen hefte ble generert eller sendt. Oppdater årsplan-JSON eller kjør manuell generering.</p>`
  });
}

function getTransporter() {
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Mangler GMAIL_USER/GMAIL_APP_PASSWORD i miljøvariabler.");
  }

  // App passwords are often copied with spaces; Gmail expects 16 chars without spaces.
  const pass = env.GMAIL_APP_PASSWORD.replace(/\s+/g, "");

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.GMAIL_USER,
      pass
    }
  });
}
