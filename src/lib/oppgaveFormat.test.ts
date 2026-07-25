import { describe, expect, it } from "vitest";
import {
  CHECK,
  RADIO,
  inferDelerFromInnhold,
  parseAlternativerFromText,
  resolveOppgaveFormat,
  svarInstruks
} from "./oppgaveFormat.js";

describe("resolveOppgaveFormat", () => {
  it("mapper årsplantyper til layout-format", () => {
    expect(resolveOppgaveFormat("leseforstaelse")).toBe("leseforstaelse");
    expect(resolveOppgaveFormat("fyll_inn_setningsstruktur")).toBe("fyll_inn");
    expect(resolveOppgaveFormat("skriveoppgave")).toBe("skrive");
    expect(resolveOppgaveFormat("muntlig")).toBe("muntlig");
  });

  it("respekterer eksplisitt format for variert", () => {
    expect(resolveOppgaveFormat("variert", "sant_usant")).toBe("sant_usant");
    expect(resolveOppgaveFormat("variert", "avkryssing")).toBe("avkryssing");
    expect(resolveOppgaveFormat("variert", "finn_par")).toBe("finn_par");
    expect(resolveOppgaveFormat("variert", "flervalg_flere")).toBe("avkryssing");
  });
});

describe("parseAlternativerFromText", () => {
  it("henter a-e alternativer", () => {
    const parsed = parseAlternativerFromText("Hva er tema? a) Hygiene b) Mat c) Sport d) Musikk");
    expect(parsed.stem).toMatch(/tema/i);
    expect(parsed.alternativer).toEqual(["Hygiene", "Mat", "Sport", "Musikk"]);
  });
});

describe("inferDelerFromInnhold", () => {
  it("lager single-valg for flervalg", () => {
    const deler = inferDelerFromInnhold(
      "Velg riktig. a) Ja b) Nei c) Vet ikke",
      2,
      "flervalg"
    );
    expect(deler?.[0]?.svarType).toBe("single");
    expect(deler?.[0]?.alternativer?.length).toBeGreaterThanOrEqual(2);
  });

  it("lager multi for avkryssing", () => {
    const deler = inferDelerFromInnhold(
      "2a Hva passer? a) A b) B c) C d) D",
      2,
      "avkryssing"
    );
    expect(deler?.[0]?.svarType).toBe("multi");
  });

  it("lager sant/usant-deler", () => {
    const deler = inferDelerFromInnhold(
      "2a Teksten handler om jobb.\n2b Alt skjer i utlandet.",
      2,
      "sant_usant"
    );
    expect(deler?.length).toBe(2);
    expect(deler?.[0]?.svarType).toBe("sant_usant");
  });
});

describe("svarInstruks symbols", () => {
  it("nevner riktig knappetype", () => {
    expect(svarInstruks("flervalg")).toContain(RADIO);
    expect(svarInstruks("avkryssing")).toContain(CHECK);
    expect(svarInstruks("sant_usant")).toMatch(/Sant|Usant/);
  });
});
