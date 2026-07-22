import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./config.js";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 dager
const SESSION_PREFIX = "mbo1";

function adminSecret(): string | null {
  return env.ADMIN_TOKEN ?? null;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Sjekk om innloggingspassord matcher ADMIN_TOKEN. */
export function verifyAdminPassword(password: string): boolean {
  const secret = adminSecret();
  if (!secret) return false;
  return safeEqual(password, secret);
}

export function createAdminSessionToken(now = Date.now()): string | null {
  const secret = adminSecret();
  if (!secret) return null;
  const exp = now + SESSION_TTL_MS;
  const payload = `${SESSION_PREFIX}.${exp}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function isValidAdminCredential(token: string): boolean {
  const secret = adminSecret();
  if (!secret || !token) return false;
  if (token.length === secret.length && safeEqual(token, secret)) return true;

  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== SESSION_PREFIX) return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload, secret);
  return safeEqual(parts[2]!, expected);
}

export function adminAuthConfigured(): boolean {
  return Boolean(adminSecret());
}
