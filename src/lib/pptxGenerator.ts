import pptxgenFactory from "pptxgenjs";
import { DEFAULT_HEADING_STYLE, DEFAULT_TEXT_STYLE } from "./documentStyles.js";
import type { Kapittel, PresentasjonData } from "./types.js";

type PptxInstance = import("pptxgenjs").default;

const PptxGenJS = pptxgenFactory as unknown as new () => PptxInstance;

export async function genererPPTX(
  kapittel: Kapittel,
  presentasjon: PresentasjonData,
  uke: number
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "MBO Automatisering";
  pptx.subject = `${kapittel.yrke} - uke ${uke}`;

  presentasjon.slides.forEach((s) => {
    const slide = pptx.addSlide();
    slide.addText(s.tittel, {
      x: 0.5,
      y: 0.4,
      w: 12.3,
      h: 0.6,
      fontFace: DEFAULT_HEADING_STYLE.font,
      fontSize: DEFAULT_HEADING_STYLE.size / 2,
      bold: DEFAULT_HEADING_STYLE.bold,
      color: DEFAULT_HEADING_STYLE.color
    });
    slide.addText(s.innhold, {
      x: 0.8,
      y: 1.4,
      w: 11.5,
      h: 4.5,
      fontFace: DEFAULT_TEXT_STYLE.font,
      fontSize: DEFAULT_TEXT_STYLE.size / 2,
      color: DEFAULT_TEXT_STYLE.color
    });
  });

  const arrayBuffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
