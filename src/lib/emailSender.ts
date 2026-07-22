import nodemailer from "nodemailer";
import { env } from "./config.js";
import type { Kapittel } from "./types.js";

function publicApiBase(): string {
  if (env.PUBLIC_API_BASE_URL) return env.PUBLIC_API_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/^https?:\/\//, "")}`;
  return "https://mbo-automation-b8bi.vercel.app";
}

function unsubscribeFooter(token?: string): string {
  if (!token) return "";
  const url = `${publicApiBase()}/api/recipients/unsubscribe?token=${encodeURIComponent(token)}`;
  return `<hr/><p style="font-size:12px;color:#555">Vil du ikke motta flere hefter?
    <a href="${url}">Avmeld deg her</a>.</p>`;
}

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
  uke: number,
  options?: { unsubscribeToken?: string }
): Promise<void> {
  const transporter = getTransporter();
  const base = `Kap_${String(kapittel.nummer).padStart(2, "0")}_${kapittel.yrke.replace(/\s+/g, "_")}_uke${uke}`;

  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: `MBO-hefte uke ${uke}: ${kapittel.yrke}`,
    html: `<p>Vedlagt finner du arbeidsheftet for uke ${uke}.</p>${unsubscribeFooter(options?.unsubscribeToken)}`,
    attachments: [{ filename: `${base}.docx`, content: wordBuffer }]
  });
}

export async function sendMissingArsplanUkeEmail(
  motaker: string,
  isoUke: number,
  options?: { unsubscribeToken?: string }
): Promise<void> {
  const transporter = getTransporter();
  await transporter.sendMail({
    from: env.GMAIL_USER,
    to: motaker,
    subject: `MBO: mangler årsplan for ISO-uke ${isoUke}`,
    html: `<p>Den automatiske ukentlige jobben fant ingen rad for ISO-uke <strong>${isoUke}</strong> i den innleste årsplanen.</p>
<p>Ingen hefte ble generert eller sendt. Oppdater årsplan-JSON eller kjør manuell generering.</p>${unsubscribeFooter(options?.unsubscribeToken)}`
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
