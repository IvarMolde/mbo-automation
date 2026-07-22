import cors from "cors";
import express from "express";
import { env } from "./lib/config.js";
import { apiRouter } from "./routes/api.js";
import { planRouter } from "./routes/plan.js";

const app = express();
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();
const allowedOrigins = env.CORS_ALLOWED_ORIGINS
  ? env.CORS_ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS policy."));
    }
  })
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "mbo-automation",
    env: env.NODE_ENV,
    config: {
      gmailUser: Boolean(env.GMAIL_USER),
      gmailAppPassword: Boolean(env.GMAIL_APP_PASSWORD),
      recipientEmail: Boolean(env.RECIPIENT_EMAIL),
      cronSecret: Boolean(env.CRON_SECRET),
      gcpProjectId: Boolean(env.GCP_PROJECT_ID),
      googleServiceAccountJson: Boolean(
        env.GOOGLE_SERVICE_ACCOUNT_JSON || env.GOOGLE_APPLICATION_CREDENTIALS_JSON
      )
    }
  });
});

app.use("/api", apiRateLimit, apiRouter);
app.use("/api", apiRateLimit, planRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[express]", raw);

  if (res.headersSent) {
    return;
  }

  let clientMessage = "Uventet serverfeil.";
  if (env.NODE_ENV === "development" && raw) {
    clientMessage = raw;
  } else if (/GMAIL_USER|GMAIL_APP_PASSWORD/i.test(raw)) {
    clientMessage = "Mangler eller ugyldig e-postkonfigurasjon (GMAIL_USER / GMAIL_APP_PASSWORD).";
  } else if (/Invalid login|EAUTH|Username and Password not accepted/i.test(raw)) {
    clientMessage = "Gmail avviste innlogging. Sjekk App Password (uten mellomrom) og 2FA.";
  } else if (err instanceof SyntaxError && "body" in err) {
    clientMessage = "Ugyldig JSON i forespørsel.";
  }

  res.status(500).json({ success: false, error: clientMessage });
});

export default app;

if (!process.env.VERCEL) {
  app.listen(env.PORT, () => {
    // Avoid leaking secrets; print only runtime metadata.
    console.log(`Server kjører på port ${env.PORT}`);
  });
}

function apiRateLimit(req: express.Request, res: express.Response, next: express.NextFunction): void {
  const now = Date.now();
  const key = req.ip || "unknown";
  const bucket = rateLimitStore.get(key);

  if (!bucket || now - bucket.windowStart >= env.RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    next();
    return;
  }

  if (bucket.count >= env.RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ success: false, error: "For mange foresporsler. Prov igjen senere." });
    return;
  }

  bucket.count += 1;
  rateLimitStore.set(key, bucket);
  next();
}
