import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Kapittel } from "../lib/types.js";

const { mockArbeidshefte, mockCronKapittel } = vi.hoisted(() => ({
  mockArbeidshefte: {
    tekstSeksjoner: [
      {
        nummer: 1,
        type: "lareverk",
        tittel: "Tittel",
        tekst: "x".repeat(40),
        oppgaver: Array.from({ length: 3 }, (_, i) => ({
          nummer: i + 1,
          type: "leseforstaelse",
          tittel: `Oppgave ${i}`,
          innhold: "i".repeat(15)
        }))
      }
    ],
    ordliste: Array.from({ length: 15 }, (_, i) => ({
      ord: `ord${i}`,
      forklaring: "forklar",
      eksempel: "eksempel"
    })),
    kapitteltest: Array.from({ length: 5 }, (_, i) => ({
      nummer: i + 1,
      innhold: "test".repeat(3)
    })),
    fasit: "f".repeat(20)
  },
  mockCronKapittel: {
    nummer: 1,
    yrke: "Renholder",
    grammatikk: "Presens og preteritum",
    arbeidsnorskTema: "Arbeidsrutiner og hygiene",
    cefrNivaa: "A2",
    cefrCanDo: {
      resepsjon: ["r"],
      samhandling: ["s"],
      produksjon: ["p"]
    },
    tematekster: [{ nummer: 1, tittel: "Vi blir kjent", type: "lareverk" }],
    oppgavestruktur: [
      { nummer: 1, type: "leseforstaelse", beskrivelse: "Leseforståelse (a-e)" }
    ],
    ordlisteAntall: 20,
    kapitteltestAntall: 10
  } satisfies Kapittel
}));

vi.mock("../lib/emailSender.js", () => ({
  sendHefte: vi.fn().mockResolvedValue(undefined),
  sendTestEmail: vi.fn().mockResolvedValue(undefined),
  sendMissingArsplanUkeEmail: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../lib/arsplanResolve.js", () => ({
  resolveKapittelForIsoUke: vi.fn(() => ({ type: "arsplan", kapittel: mockCronKapittel })),
  resetArsplanCache: vi.fn()
}));

vi.mock("../lib/gemini.js", () => ({
  genererArbeidshefte: vi.fn().mockResolvedValue({ data: mockArbeidshefte, source: "gemini" })
}));

vi.mock("../lib/wordGenerator.js", () => ({
  genererWordHefte: vi.fn().mockResolvedValue(Buffer.from("docx"))
}));

describe("api cron", () => {
  const cronSecret = "test-cron-secret!";
  let app: express.Express;

  beforeAll(async () => {
    vi.resetModules();
    process.env.CRON_SECRET = cronSecret;
    process.env.RECIPIENT_EMAIL = "cron-test@example.com";
    process.env.NODE_ENV = "test";

    const { apiRouter } = await import("./api.js");
    app = express();
    app.use(express.json());
    app.use("/api", apiRouter);
  });

  it("GET /api/cron returns 401 without Authorization", async () => {
    const res = await request(app).get("/api/cron");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("GET /api/cron returns 200 with valid Bearer", async () => {
    const res = await request(app)
      .get("/api/cron")
      .set("Authorization", `Bearer ${cronSecret}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      kapittel: expect.any(Number),
      uke: expect.any(Number)
    });
  });

  it("POST /api/cron returns 200 with valid Bearer", async () => {
    const res = await request(app)
      .post("/api/cron")
      .set("Authorization", `Bearer ${cronSecret}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
