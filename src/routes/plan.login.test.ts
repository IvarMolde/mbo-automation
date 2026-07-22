import express from "express";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";

describe("plan login", () => {
  const password = "test-admin-pass!";
  let app: express.Express;

  beforeAll(async () => {
    vi.resetModules();
    process.env.ADMIN_TOKEN = password;
    process.env.NODE_ENV = "test";

    const { planRouter } = await import("./plan.js");
    app = express();
    app.use(express.json());
    app.use("/api", planRouter);
  });

  it("rejects wrong password", async () => {
    const res = await request(app).post("/api/plan/login").send({ password: "feil-passord!!" });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("returns session token for correct password", async () => {
    const res = await request(app).post("/api/plan/login").send({ password });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.sessionToken).toMatch(/^mbo1\.\d+\./);
  });

  it("accepts session token as Bearer auth", async () => {
    const login = await request(app).post("/api/plan/login").send({ password });
    const token = login.body.sessionToken as string;
    const res = await request(app)
      .post("/api/plan/unlock")
      .set("Authorization", `Bearer ${token}`)
      .send({ uke: 40 });
    expect(res.status).not.toBe(401);
  });
});
