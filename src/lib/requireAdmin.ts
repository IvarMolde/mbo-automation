import { type Request } from "express";
import {
  adminAuthConfigured,
  isValidAdminCredential
} from "./adminSession.js";

export class AdminAuthError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
    this.name = "AdminAuthError";
  }
}

export function requireAdmin(req: Request): void {
  if (!adminAuthConfigured()) {
    throw new AdminAuthError(503, "Admin-pålogging er ikke konfigurert på serveren.");
  }
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : req.header("x-admin-token") ?? "";
  if (!isValidAdminCredential(token)) {
    throw new AdminAuthError(401, "Ikke innlogget eller ugyldig økt. Logg inn på nytt.");
  }
}
