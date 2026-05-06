import PptxGenJS from "pptxgenjs";
import type { Kapittel, PresentasjonData } from "./types.js";

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
    slide.addText(s.tittel, { x: 0.5, y: 0.4, w: 12.3, h: 0.6, fontSize: 28, bold: true, color: "003057" });
    slide.addText(s.innhold, { x: 0.8, y: 1.4, w: 11.5, h: 4.5, fontSize: 18, color: "001219" });
  });

  const arrayBuffer = (await pptx.write({ outputType: "arraybuffer" })) as ArrayBuffer;
  return Buffer.from(arrayBuffer);
}
