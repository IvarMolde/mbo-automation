import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEADING_STYLE,
  DEFAULT_PARAGRAPH_SPACING,
  DEFAULT_TEXT_STYLE,
  LEFT_INDENT,
  LIGHT_HEADER_BACKGROUND,
  LIGHT_TABLE_BACKGROUND,
  TASK_INDENT,
  THIN_BLACK_BORDER_SIZE,
} from "./documentStyles.js";
import { formatOppgaveTekst } from "./wordGenerator.js";

describe("document styles", () => {
  it("uses Arial font at 12pt, 1.5 line spacing and extra task indent", () => {
    expect(DEFAULT_TEXT_STYLE).toMatchObject({
      font: "Arial",
      size: 24,
      bold: false,
      color: "000000",
    });

    expect(DEFAULT_HEADING_STYLE).toMatchObject({
      font: "Arial",
      size: 24,
      bold: true,
      color: "000000",
    });

    expect(DEFAULT_PARAGRAPH_SPACING).toMatchObject({
      line: 360,
      lineRule: "auto",
      before: 60,
      after: 120,
    });

    expect(LEFT_INDENT).toBe(720);
    expect(TASK_INDENT).toBe(1440);
    expect(LIGHT_TABLE_BACKGROUND).toBe("F5F7FB");
    expect(LIGHT_HEADER_BACKGROUND).toBe("EAF2FF");
    expect(THIN_BLACK_BORDER_SIZE).toBe(8);
  });

  it("formats sant/usant as vertical checkbox choices", () => {
    expect(formatOppgaveTekst("Er dette riktig? Sant / Usant")).toEqual([
      "Er dette riktig?",
      "□ Sant",
      "□ Usant",
    ]);
  });
});
