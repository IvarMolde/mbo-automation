import { describe, expect, it } from "vitest";
import { normalizeOrdlisteOrd } from "./gemini.js";

describe("normalizeOrdlisteOrd", () => {
  it("normaliserer casing for å/en/ei/et", () => {
    expect(normalizeOrdlisteOrd("Å rydde")).toBe("å rydde");
    expect(normalizeOrdlisteOrd("En kollega")).toBe("en kollega");
    expect(normalizeOrdlisteOrd("Ei hylle")).toBe("ei hylle");
    expect(normalizeOrdlisteOrd("Et lager")).toBe("et lager");
  });

  it("legger til å for verb uten partikkel når forklaring sier verb", () => {
    expect(normalizeOrdlisteOrd("rydde", "verb: gjøre rent")).toBe("å rydde");
  });

  it("finner ikke på artikkel for substantiv uten artikkel", () => {
    expect(normalizeOrdlisteOrd("lager", "substantiv: sted for varer")).toBe("lager");
  });
});
