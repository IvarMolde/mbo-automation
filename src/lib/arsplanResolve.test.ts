import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function minimalArsplan(isoUkeRow: number, kapittelNummer: number) {
  return {
    metadata: { tittel: "Testplan" },
    perioder: [
      {
        maned: "Test",
        ukeStart: isoUkeRow,
        ukeSlutt: isoUkeRow,
        uker: [isoUkeRow],
        kapitler: [kapittelNummer],
        fokus: "fokus"
      }
    ],
    uker: [
      {
        uke: isoUkeRow,
        kapittel: kapittelNummer,
        maned: "Test",
        periodeFokus: "ukefokus"
      }
    ],
    kapitler: [
      {
        nummer: kapittelNummer,
        tittel: "Kapitteltittel",
        maned: "Test",
        ukeStart: isoUkeRow,
        ukeSlutt: isoUkeRow,
        uker: [isoUkeRow],
        periodeFokus: "kapittelfokus",
        cefrNivaa: ["A2"],
        standardNiva: "A2",
        grammatikk: "Verb",
        yrke: "Testyrke",
        arbeidsnorskTema: "Testtema"
      }
    ]
  };
}

describe("arsplanResolve", () => {
  let tmpDir: string;
  let jsonPath: string;
  let resolveKapittelForIsoUke: typeof import("./arsplanResolve.js").resolveKapittelForIsoUke;
  let resetArsplanCache: typeof import("./arsplanResolve.js").resetArsplanCache;

  beforeEach(async () => {
    vi.resetModules();
    tmpDir = join(tmpdir(), `mbo-arsplan-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tmpDir, { recursive: true });
    jsonPath = join(tmpDir, "arsplan.json");
    writeFileSync(jsonPath, JSON.stringify(minimalArsplan(34, 1)));
    process.env.ARSPLAN_JSON_PATH = jsonPath;
    const mod = await import("./arsplanResolve.js");
    resolveKapittelForIsoUke = mod.resolveKapittelForIsoUke;
    resetArsplanCache = mod.resetArsplanCache;
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
    delete process.env.ARSPLAN_JSON_PATH;
  });

  it("returnerer mangler_uke når uken ikke finnes i årsplan", () => {
    resetArsplanCache();
    expect(resolveKapittelForIsoUke(99)).toEqual({ type: "mangler_uke", isoUke: 99 });
  });

  it("mapper årsplan-rad til Kapittel", () => {
    resetArsplanCache();
    const r = resolveKapittelForIsoUke(34);
    expect(r.type).toBe("arsplan");
    if (r.type === "arsplan") {
      expect(r.kapittel.nummer).toBe(1);
      expect(r.kapittel.yrke).toBe("Testyrke");
      expect(r.kapittel.arbeidsnorskTema).toBe("Testtema");
      expect(r.kapittel.periodeFokus).toBe("kapittelfokus");
      expect(r.kapittel.ordlisteAntall).toBe(20);
      expect(r.kapittel.kapitteltestAntall).toBe(10);
    }
  });

  it("tar med tematekster og oppgavestruktur fra årsplan", () => {
    writeFileSync(
      jsonPath,
      JSON.stringify({
        ...minimalArsplan(34, 1),
        kapitler: [
          {
            ...minimalArsplan(34, 1).kapitler[0],
            tematekster: [
              { nummer: 1, tittel: "Vi blir kjent", type: "lareverk" },
              { nummer: 2, tittel: "Renholder", type: "yrke_arbeidsnorsk" }
            ],
            oppgavestruktur: [
              { nummer: 1, type: "leseforstaelse", beskrivelse: "a-e" },
              { nummer: 2, type: "variert", beskrivelse: "flervalg" }
            ],
            ordliste: { antall: 20 },
            kapitteltest: { antallOppgaver: 10 },
            fasit: "Svar på lukkede oppgaver"
          }
        ]
      })
    );
    resetArsplanCache();
    const r = resolveKapittelForIsoUke(34);
    expect(r.type).toBe("arsplan");
    if (r.type === "arsplan") {
      expect(r.kapittel.tematekster).toHaveLength(2);
      expect(r.kapittel.oppgavestruktur?.[0]?.type).toBe("leseforstaelse");
      expect(r.kapittel.fasitInstruks).toBe("Svar på lukkede oppgaver");
    }
  });

  it("bruker modulo-fallback når JSON-fil mangler", async () => {
    const missingPath = join(tmpDir, "finnes-ikke.json");
    process.env.ARSPLAN_JSON_PATH = missingPath;
    vi.resetModules();
    const { resetArsplanCache: r, resolveKapittelForIsoUke: res } = await import("./arsplanResolve.js");
    r();
    const out = res(1);
    expect(out.type).toBe("fallback");
    if (out.type === "fallback") {
      expect(out.kapittel.nummer).toBe(1);
    }
  });

  it("overstyrKapittelNummer gir overstyring fra katalog", () => {
    resetArsplanCache();
    const r = resolveKapittelForIsoUke(34, { overstyrKapittelNummer: 3 });
    expect(r.type).toBe("overstyring");
    if (r.type === "overstyring") {
      expect(r.kapittel.nummer).toBe(3);
      expect(r.kapittel.yrke).toBe("Kokk");
    }
  });

  it("kaster ved ugyldig overstyrKapittelNummer", () => {
    resetArsplanCache();
    expect(() => resolveKapittelForIsoUke(1, { overstyrKapittelNummer: 999 })).toThrow(/finnes ikke/);
  });
});
