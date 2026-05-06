import cors from "cors";
import express from "express";
import { env } from "./lib/config.js";
import { apiRouter } from "./routes/api.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    service: "mbo-automation",
    env: env.NODE_ENV
  });
});

app.use("/api", apiRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Uventet serverfeil.";
  res.status(500).json({ success: false, error: message });
});

app.listen(env.PORT, () => {
  // Avoid leaking secrets; print only runtime metadata.
  console.log(`Server kjører på port ${env.PORT}`);
});
