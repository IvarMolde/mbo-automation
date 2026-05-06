import { Document, Packer, Paragraph, TextRun } from "docx";
import type { ArbeidshefteData, Kapittel } from "./types.js";

export async function genererWordHefte(
  kapittel: Kapittel,
  arbeidshefte: ArbeidshefteData,
  uke: number
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      children: [new TextRun({ text: `Kapittel ${kapittel.nummer} - ${kapittel.yrke}`, bold: true, size: 32 })]
    }),
    new Paragraph(`Uke ${uke}`),
    new Paragraph(`Tema: ${kapittel.arbeidsnorskTema}`),
    new Paragraph(`Grammatikk: ${kapittel.grammatikk}`),
    new Paragraph("")
  ];

  arbeidshefte.lesetekster.forEach((t) => {
    children.push(new Paragraph({ children: [new TextRun({ text: t.tittel, bold: true })] }));
    children.push(new Paragraph(t.tekst));
    children.push(new Paragraph(""));
  });

  children.push(new Paragraph({ children: [new TextRun({ text: "Ordliste", bold: true })] }));
  arbeidshefte.ordliste.forEach((o) => {
    children.push(new Paragraph(`${o.ord}: ${o.forklaring} (${o.eksempel})`));
  });

  const doc = new Document({
    sections: [{ children }]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
