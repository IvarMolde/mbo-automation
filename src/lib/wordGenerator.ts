import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { ArbeidshefteData, Kapittel } from "./types.js";

export async function genererWordHefte(
  kapittel: Kapittel,
  arbeidshefte: ArbeidshefteData,
  uke: number
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [
        new TextRun({
          text: `Kapittel ${kapittel.nummer} – ${kapittel.yrke}`,
          bold: true,
          size: 36,
          color: "003057"
        })
      ]
    }),
    new Paragraph({
      children: [new TextRun({ text: `Uke ${uke}`, bold: true, color: "005F73" })]
    }),
    new Paragraph(`Tema: ${kapittel.arbeidsnorskTema}`),
    new Paragraph(`Grammatikk: ${kapittel.grammatikk}`),
    new Paragraph(`Nivå: ${kapittel.cefrNivaa}`)
  ];

  if (kapittel.periodeFokus) {
    children.push(new Paragraph(`Periodens fokus: ${kapittel.periodeFokus}`));
  }

  children.push(new Paragraph(""));

  for (const seksjon of arbeidshefte.tekstSeksjoner) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: `Tekst ${seksjon.nummer}: ${seksjon.tittel}`,
            bold: true,
            color: "003057"
          })
        ]
      })
    );
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Type: ${seksjon.type}`, italics: true, color: "005F73", size: 20 })]
      })
    );
    children.push(new Paragraph(seksjon.tekst));
    children.push(new Paragraph(""));

    for (const oppgave of seksjon.oppgaver) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Oppgave ${String(oppgave.nummer).padStart(2, "0")} (${oppgave.type}): ${oppgave.tittel}`,
              bold: true,
              color: "EE9B00"
            })
          ]
        })
      );
      children.push(new Paragraph(oppgave.innhold));
      children.push(new Paragraph(""));
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Ordliste", bold: true, color: "003057" })]
    })
  );
  for (const o of arbeidshefte.ordliste) {
    children.push(new Paragraph(`${o.ord}: ${o.forklaring} (${o.eksempel})`));
  }

  children.push(new Paragraph(""));
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Kapitteltest", bold: true, color: "003057" })]
    })
  );
  for (const t of arbeidshefte.kapitteltest) {
    children.push(new Paragraph(`${t.nummer}. ${t.innhold}`));
  }

  children.push(new Paragraph(""));
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun({ text: "Fasit", bold: true, color: "003057" })]
    })
  );
  for (const line of arbeidshefte.fasit.split(/\n+/)) {
    if (line.trim()) {
      children.push(new Paragraph(line.trim()));
    }
  }

  const doc = new Document({
    sections: [{ children }]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
