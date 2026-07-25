import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType
} from "docx";
import type { ArbeidshefteData, GrammatikkForklaring, Kapittel, Oppgave, OppgaveDel, TekstSeksjon } from "./types.js";
import {
  CHECK,
  RADIO,
  defaultSvarTypeForFormat,
  inferDelerFromInnhold,
  oppgaveTypeLabel,
  resolveOppgaveFormat,
  svarInstruks,
  type OppgaveFormat
} from "./oppgaveFormat.js";

/** MBO design tokens (pedagogisk Word-mal 2026). */
const C = {
  marine: "003057",
  teal: "005F73",
  amber: "EE9B00",
  night: "001219",
  softTeal: "E6F2F4",
  softAmber: "FFF6E5",
  softGray: "F5F7F8",
  white: "FFFFFF",
  line: "D0D7DE"
} as const;

const PAGE_WIDTH = 11906; // A4 twips
const MARGIN = 1134; // ~2 cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const thinLine = { style: BorderStyle.SINGLE, size: 4, color: C.line };
const tealLeft = { style: BorderStyle.SINGLE, size: 24, color: C.teal };
const amberLeft = { style: BorderStyle.SINGLE, size: 24, color: C.amber };

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 140 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: C.teal, space: 4 }
    },
    children: [
      new TextRun({
        text,
        bold: true,
        color: C.marine,
        size: 28,
        font: "Calibri"
      })
    ]
  });
}

function bodyText(text: string, opts?: { bold?: boolean; color?: string; size?: number; italics?: boolean }): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italics,
        color: opts?.color ?? C.night,
        size: opts?.size ?? 22,
        font: "Calibri"
      })
    ]
  });
}

function metaLabel(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: C.teal, size: 20, font: "Calibri" }),
      new TextRun({ text: value, color: C.night, size: 20, font: "Calibri" })
    ]
  });
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    lareverk: "Læreverk",
    yrke_arbeidsnorsk: "Yrke + arbeidsnorsk",
    arbeidsnorsk: "Arbeidsnorsk",
    hverdagssituasjon: "Hverdagssituasjon"
  };
  return map[type] ?? type;
}

function cell(
  children: Paragraph[],
  width: number,
  opts?: {
    shading?: string;
    borders?: Partial<
      Record<
        "top" | "bottom" | "left" | "right",
        { style: (typeof BorderStyle)[keyof typeof BorderStyle]; size: number; color: string }
      >
    >;
    align?: typeof VerticalAlign.CENTER | typeof VerticalAlign.TOP;
  }
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts?.shading ? { type: ShadingType.CLEAR, fill: opts.shading } : undefined,
    borders: {
      top: opts?.borders?.top ?? noBorder,
      bottom: opts?.borders?.bottom ?? noBorder,
      left: opts?.borders?.left ?? noBorder,
      right: opts?.borders?.right ?? noBorder
    },
    verticalAlign: opts?.align ?? VerticalAlign.CENTER,
    children
  });
}

function headerBar(kapittel: Kapittel, uke: number): Table {
  const w1 = Math.floor(CONTENT_WIDTH * 0.42);
  const w2 = Math.floor(CONTENT_WIDTH * 0.28);
  const w3 = CONTENT_WIDTH - w1 - w2;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [w1, w2, w3],
    rows: [
      new TableRow({
        children: [
          cell(
            [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Molde voksenopplæringssenter",
                    bold: true,
                    color: C.white,
                    size: 18,
                    font: "Calibri"
                  })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Arbeid og norsk – MBO",
                    color: C.white,
                    size: 16,
                    font: "Calibri"
                  })
                ]
              })
            ],
            w1,
            { shading: C.marine }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: `Uke ${uke}`, bold: true, color: C.white, size: 20, font: "Calibri" })
                ]
              })
            ],
            w2,
            { shading: C.teal }
          ),
          cell(
            [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `CEFR ${kapittel.cefrNivaa}`,
                    bold: true,
                    color: C.night,
                    size: 18,
                    font: "Calibri"
                  })
                ]
              })
            ],
            w3,
            { shading: C.softAmber }
          )
        ]
      })
    ]
  });
}

function titleBlock(kapittel: Kapittel): Paragraph[] {
  return [
    spacer(200),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: `Kapittel ${kapittel.nummer}`,
          bold: true,
          color: C.teal,
          size: 22,
          font: "Calibri"
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 160 },
      children: [
        new TextRun({
          text: kapittel.yrke,
          bold: true,
          color: C.marine,
          size: 40,
          font: "Calibri"
        })
      ]
    }),
    metaLabel("Tema", kapittel.arbeidsnorskTema),
    metaLabel("Grammatikk", kapittel.grammatikk),
    ...(kapittel.periodeFokus ? [metaLabel("Periodens fokus", kapittel.periodeFokus)] : []),
    spacer(80)
  ];
}

function learningGoals(kapittel: Kapittel): Array<Paragraph | Table> {
  const goals = [
    ...kapittel.cefrCanDo.resepsjon.slice(0, 2),
    ...kapittel.cefrCanDo.samhandling.slice(0, 2),
    ...kapittel.cefrCanDo.produksjon.slice(0, 2)
  ];

  return [
    sectionTitle("Læringsmål"),
    new Paragraph({
      spacing: { after: 100 },
      children: [
        new TextRun({
          text: "Etter dette kapittelet skal du kunne:",
          italics: true,
          color: C.teal,
          size: 20,
          font: "Calibri"
        })
      ]
    }),
    ...goals.map(
      (g) =>
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 120 },
          children: [
            new TextRun({ text: "▸  ", color: C.amber, size: 22, font: "Calibri" }),
            new TextRun({ text: g, color: C.night, size: 21, font: "Calibri" })
          ]
        })
    ),
    spacer(120)
  ];
}

function grammatikkSection(g: GrammatikkForklaring): Array<Paragraph | Table> {
  const forklaringParas = g.forklaring
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        new Paragraph({
          spacing: { after: 120, line: 300 },
          keepLines: true,
          children: [new TextRun({ text: p, color: C.night, size: 21, font: "Calibri" })]
        })
    );

  const eksempelParas = g.eksempler.map(
    (ex, i) =>
      new Paragraph({
        spacing: { after: 80, line: 276 },
        indent: { left: 120 },
        keepLines: true,
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true, color: C.teal, size: 20, font: "Calibri" }),
          new TextRun({ text: ex, color: C.night, size: 20, font: "Calibri" })
        ]
      })
  );

  const tipParas = g.huskeregel
    ? [
        new Paragraph({
          spacing: { before: 120, after: 60 },
          keepNext: true,
          children: [
            new TextRun({ text: "Huskeregel", bold: true, color: C.amber, size: 18, font: "Calibri" })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          keepLines: true,
          children: [new TextRun({ text: g.huskeregel, color: C.night, size: 20, font: "Calibri" })]
        })
      ]
    : [];

  return [
    sectionTitle("Grammatikk"),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [CONTENT_WIDTH],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(
              [
                new Paragraph({
                  spacing: { after: 100 },
                  keepNext: true,
                  children: [
                    new TextRun({
                      text: g.tittel,
                      bold: true,
                      color: C.marine,
                      size: 24,
                      font: "Calibri"
                    })
                  ]
                }),
                ...forklaringParas,
                new Paragraph({
                  spacing: { before: 80, after: 80 },
                  keepNext: true,
                  children: [
                    new TextRun({
                      text: "Eksempler",
                      bold: true,
                      color: C.teal,
                      size: 18,
                      font: "Calibri"
                    })
                  ]
                }),
                ...eksempelParas,
                ...tipParas,
                spacer(60)
              ],
              CONTENT_WIDTH,
              {
                shading: C.softTeal,
                borders: {
                  top: thinLine,
                  bottom: thinLine,
                  left: tealLeft,
                  right: thinLine
                },
                align: VerticalAlign.TOP
              }
            )
          ]
        })
      ]
    }),
    spacer(160)
  ];
}

function textBox(seksjon: TekstSeksjon): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          cell(
            [
              new Paragraph({
                spacing: { after: 80 },
                children: [
                  new TextRun({
                    text: typeLabel(seksjon.type).toUpperCase(),
                    bold: true,
                    color: C.teal,
                    size: 16,
                    font: "Calibri"
                  })
                ]
              }),
              new Paragraph({
                spacing: { after: 120 },
                keepNext: true,
                children: [
                  new TextRun({
                    text: `Tekst ${seksjon.nummer}: ${seksjon.tittel}`,
                    bold: true,
                    color: C.marine,
                    size: 24,
                    font: "Calibri"
                  })
                ]
              }),
              ...seksjon.tekst.split(/\n+/).filter(Boolean).map((line) =>
                new Paragraph({
                  spacing: { after: 100, line: 300 },
                  keepLines: true,
                  children: [
                    new TextRun({ text: line.trim(), color: C.night, size: 22, font: "Calibri" })
                  ]
                })
              )
            ],
            CONTENT_WIDTH,
            {
              shading: C.softTeal,
              borders: {
                top: thinLine,
                bottom: thinLine,
                left: tealLeft,
                right: thinLine
              },
              align: VerticalAlign.TOP
            }
          )
        ]
      })
    ]
  });
}

function writingLines(count: number): Paragraph[] {
  return Array.from({ length: count }, () =>
    new Paragraph({
      spacing: { before: 100, after: 100 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: C.line, space: 1 }
      },
      children: [new TextRun({ text: " ", size: 22 })]
    })
  );
}

/**
 * Split task body so deloppgaver always start on their own line.
 * When oppgaveNummer is set, lettered parts become 1a, 1b, 2a, … (not plain a)/b)).
 */
export function splitOppgaveInnhold(raw: string, oppgaveNummer?: number): string[] {
  let text = raw.replace(/\r\n/g, "\n").trim();
  // Already labeled: "1a)", "1a.", "1a " → placeholder
  text = text.replace(/(?:^|[ \t]+)(\d{1,2})([a-eA-E])\s*[\)\.]?\s+/gm, "\n§$2§ ");
  // Plain letters: "a)", "b." → placeholder
  text = text.replace(/(?:^|[ \t]+)([a-eA-E])\s*[\)\.]\s+/gm, "\n§$1§ ");
  // Mid-sentence: "...tekst. a) ..." or "...tekst. 1a) ..."
  text = text.replace(/([.!?:,;])\s*(?:\d{1,2})?([a-eA-E])\s*[\)\.]?\s+/g, "$1\n§$2§ ");
  // Numbered list items (1) 2) …) that are not lettered deloppgaver
  text = text.replace(/(?:^|[ \t]+)(\d{1,2})\s*[\)\.]\s+/gm, "\n$1) ");

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const lettered = trimmed.match(/^§([a-eA-E])§\s*(.*)$/);
      if (lettered) {
        const letter = lettered[1].toLowerCase();
        const rest = lettered[2].trim();
        if (oppgaveNummer != null) {
          return rest ? `${oppgaveNummer}${letter} ${rest}` : `${oppgaveNummer}${letter}`;
        }
        return rest ? `${letter}) ${rest}` : `${letter})`;
      }
      return trimmed;
    })
    .filter(Boolean);
}

function para(
  text: string,
  opts?: {
    bold?: boolean;
    color?: string;
    size?: number;
    italics?: boolean;
    indent?: number;
    after?: number;
    keepNext?: boolean;
  }
): Paragraph {
  return new Paragraph({
    spacing: { after: opts?.after ?? 100, line: 276 },
    indent: opts?.indent != null ? { left: opts.indent } : undefined,
    keepLines: true,
    keepNext: opts?.keepNext,
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        italics: opts?.italics,
        color: opts?.color ?? C.night,
        size: opts?.size ?? 21,
        font: "Calibri"
      })
    ]
  });
}

function choiceLine(symbol: string, text: string, letter?: string): Paragraph {
  const label = letter ? `${letter}  ` : "";
  return new Paragraph({
    spacing: { after: 90, line: 276 },
    indent: { left: 200 },
    keepLines: true,
    children: [
      new TextRun({
        text: `${symbol}  ${label}${text}`,
        color: C.night,
        size: 21,
        font: "Calibri"
      })
    ]
  });
}

function santUsantLine(merke: string, tekst: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 300 },
    keepLines: true,
    children: [
      new TextRun({ text: `${merke}  `, bold: true, color: C.marine, size: 21, font: "Calibri" }),
      new TextRun({ text: `${tekst}   `, color: C.night, size: 21, font: "Calibri" }),
      new TextRun({ text: `${RADIO} Sant    ${RADIO} Usant`, color: C.teal, size: 21, font: "Calibri", bold: true })
    ]
  });
}

function ordbankParagraphs(ord: string[]): Paragraph[] {
  const chips = ord.map((w) => w.trim()).filter(Boolean);
  return [
    para("Ordbank", { bold: true, color: C.amber, size: 18, after: 40, keepNext: true }),
    para(chips.map((w) => `[ ${w} ]`).join("   "), { size: 20, after: 120 }),
    para("Bruk ordene over. Skriv på strekene under.", {
      italics: true,
      color: C.teal,
      size: 17,
      after: 120
    })
  ];
}

function finnParParagraphs(venstre: string[], hoyre: string[]): Paragraph[] {
  const out: Paragraph[] = [
    para("Venstre kolonne", { bold: true, color: C.teal, size: 18, after: 60, keepNext: true })
  ];
  for (const item of venstre) {
    out.push(
      new Paragraph({
        spacing: { after: 80, line: 276 },
        keepLines: true,
        children: [
          new TextRun({ text: `${item}   →   ____`, color: C.night, size: 20, font: "Calibri" })
        ]
      })
    );
  }
  out.push(spacer(80));
  out.push(para("Høyre kolonne (velg bokstav)", { bold: true, color: C.teal, size: 18, after: 60 }));
  for (const item of hoyre) {
    out.push(para(item, { size: 20, indent: 120, after: 60 }));
  }
  out.push(spacer(40));
  return out;
}

function renderDel(del: OppgaveDel, format: OppgaveFormat): Paragraph[] {
  const out: Paragraph[] = [];
  const svarType = del.svarType || defaultSvarTypeForFormat(format);

  if (svarType === "sant_usant") {
    out.push(santUsantLine(del.merke, del.tekst));
    return out;
  }

  out.push(
    para(`${del.merke}  ${del.tekst}`, {
      bold: true,
      color: C.marine,
      size: 21,
      after: 80,
      keepNext: true
    })
  );

  if (svarType === "single" && del.alternativer?.length) {
    del.alternativer.forEach((alt, i) => {
      const letter = String.fromCharCode(65 + i);
      out.push(choiceLine(RADIO, alt, letter));
    });
    out.push(spacer(60));
    return out;
  }

  if (svarType === "multi" && del.alternativer?.length) {
    del.alternativer.forEach((alt, i) => {
      const letter = String.fromCharCode(65 + i);
      out.push(choiceLine(CHECK, alt, letter));
    });
    out.push(spacer(60));
    return out;
  }

  if (svarType === "fyll_inn") {
    // Ensure visible blank if model forgot underscores in the sentence
    if (!/_{2,}|…|\.\.\./.test(del.tekst)) {
      out.push(
        para("______________________________", {
          color: C.teal,
          size: 22,
          indent: 160,
          after: 100
        })
      );
    }
    out.push(spacer(40));
    return out;
  }

  // open
  out.push(...writingLines(format === "skrive" ? 5 : 2));
  out.push(spacer(40));
  return out;
}

function renderOppgaveBody(oppgave: Oppgave, format: OppgaveFormat): Paragraph[] {
  const body: Paragraph[] = [
    para(oppgave.innhold, { size: 20, after: 100, keepNext: true }),
    para(svarInstruks(format), {
      italics: true,
      color: C.teal,
      size: 17,
      after: 140,
      keepNext: true
    })
  ];

  if (format === "fyll_inn" && oppgave.ordbank?.length) {
    body.push(...ordbankParagraphs(oppgave.ordbank));
  }

  if (format === "finn_par" && oppgave.par) {
    body.push(...finnParParagraphs(oppgave.par.venstre, oppgave.par.hoyre));
    return body;
  }

  if (format === "muntlig" && oppgave.roller?.length) {
    for (const rolle of oppgave.roller) {
      body.push(
        para(`Rolle ${rolle.navn}`, { bold: true, color: C.amber, size: 19, after: 40, keepNext: true })
      );
      body.push(para(rolle.tekst, { size: 20, after: 100 }));
    }
    body.push(para("Sjekkliste", { bold: true, color: C.teal, size: 18, after: 60 }));
  }

  const deler =
    oppgave.deler ??
    inferDelerFromInnhold(oppgave.innhold, oppgave.nummer, format) ??
    [];

  if (deler.length) {
    for (const del of deler) {
      if (format === "muntlig") {
        body.push(
          new Paragraph({
            spacing: { after: 90, line: 276 },
            keepLines: true,
            children: [
              new TextRun({
                text: `${CHECK}  ${del.merke}  ${del.tekst}`,
                color: C.night,
                size: 21,
                font: "Calibri"
              })
            ]
          })
        );
      } else {
        body.push(...renderDel(del, format));
      }
    }
  } else if (format === "skrive" || format === "muntlig") {
    body.push(...writingLines(format === "skrive" ? 6 : 2));
  } else {
    // Fallback: plain split text
    for (const line of splitOppgaveInnhold(oppgave.innhold, oppgave.nummer)) {
      body.push(para(line, { size: 21, after: 100 }));
    }
    if (format === "fyll_inn") body.push(...writingLines(3));
  }

  return body;
}

function oppgaveBlock(oppgave: Oppgave): Array<Paragraph | Table> {
  const format = resolveOppgaveFormat(oppgave.type, oppgave.format);
  const num = String(oppgave.nummer).padStart(2, "0");
  const typeTekst = oppgaveTypeLabel(oppgave.type, format);

  const block: Array<Paragraph | Table> = [
    spacer(280),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [720, CONTENT_WIDTH - 720],
      rows: [
        new TableRow({
          // Keep the whole oppgave on one page when possible.
          cantSplit: true,
          children: [
            cell(
              [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: num, bold: true, color: C.white, size: 22, font: "Calibri" })
                  ]
                })
              ],
              720,
              { shading: C.amber }
            ),
            cell(
              [
                new Paragraph({
                  spacing: { after: 40 },
                  keepNext: true,
                  keepLines: true,
                  children: [
                    new TextRun({
                      text: oppgave.tittel,
                      bold: true,
                      color: C.marine,
                      size: 22,
                      font: "Calibri"
                    })
                  ]
                }),
                new Paragraph({
                  spacing: { after: 100 },
                  keepNext: true,
                  keepLines: true,
                  children: [
                    new TextRun({
                      text: typeTekst,
                      italics: true,
                      color: C.teal,
                      size: 16,
                      font: "Calibri"
                    })
                  ]
                }),
                ...renderOppgaveBody(oppgave, format),
                spacer(80)
              ],
              CONTENT_WIDTH - 720,
              {
                shading: C.softGray,
                borders: {
                  top: thinLine,
                  bottom: thinLine,
                  left: amberLeft,
                  right: thinLine
                },
                align: VerticalAlign.TOP
              }
            )
          ]
        })
      ]
    }),
    spacer(160)
  ];

  return block;
}

function vocabularyTable(arbeidshefte: ArbeidshefteData): Table {
  const c1 = Math.floor(CONTENT_WIDTH * 0.22);
  const c2 = Math.floor(CONTENT_WIDTH * 0.38);
  const c3 = CONTENT_WIDTH - c1 - c2;

  const header = new TableRow({
    children: [
      cell(
        [new Paragraph({ children: [new TextRun({ text: "Ord", bold: true, color: C.white, size: 18, font: "Calibri" })] })],
        c1,
        { shading: C.marine, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine } }
      ),
      cell(
        [new Paragraph({ children: [new TextRun({ text: "Forklaring", bold: true, color: C.white, size: 18, font: "Calibri" })] })],
        c2,
        { shading: C.marine, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine } }
      ),
      cell(
        [new Paragraph({ children: [new TextRun({ text: "Eksempel", bold: true, color: C.white, size: 18, font: "Calibri" })] })],
        c3,
        { shading: C.marine, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine } }
      )
    ]
  });

  const rows = arbeidshefte.ordliste.map((o, i) => {
    const fill = i % 2 === 0 ? C.white : C.softGray;
    return new TableRow({
      cantSplit: true,
      children: [
        cell(
          [new Paragraph({ children: [new TextRun({ text: o.ord, bold: true, color: C.marine, size: 18, font: "Calibri" })] })],
          c1,
          { shading: fill, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine }, align: VerticalAlign.TOP }
        ),
        cell(
          [new Paragraph({ children: [new TextRun({ text: o.forklaring, color: C.night, size: 18, font: "Calibri" })] })],
          c2,
          { shading: fill, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine }, align: VerticalAlign.TOP }
        ),
        cell(
          [new Paragraph({ children: [new TextRun({ text: o.eksempel, color: C.night, size: 18, font: "Calibri" })] })],
          c3,
          { shading: fill, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine }, align: VerticalAlign.TOP }
        )
      ]
    });
  });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [c1, c2, c3],
    rows: [header, ...rows]
  });
}

function pageBreak(): Paragraph {
  return new Paragraph({ children: [], pageBreakBefore: true });
}

export async function genererWordHefte(
  kapittel: Kapittel,
  arbeidshefte: ArbeidshefteData,
  uke: number
): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [
    headerBar(kapittel, uke),
    ...titleBlock(kapittel),
    ...learningGoals(kapittel),
    ...grammatikkSection(arbeidshefte.grammatikkForklaring)
  ];

  for (const seksjon of arbeidshefte.tekstSeksjoner) {
    children.push(spacer(160));
    children.push(textBox(seksjon));
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          new TextRun({
            text: `Oppgaver til tekst ${seksjon.nummer}`,
            bold: true,
            color: C.marine,
            size: 22,
            font: "Calibri"
          })
        ]
      })
    );
    for (const oppgave of seksjon.oppgaver) {
      children.push(...oppgaveBlock(oppgave));
    }
  }

  children.push(sectionTitle("Ordliste"));
  children.push(
    bodyText("Viktige ord fra kapittelet. Verb står med «å», substantiv med riktig artikkel (en/ei/et).", {
      italics: true,
      color: C.teal,
      size: 20
    })
  );
  children.push(vocabularyTable(arbeidshefte));

  children.push(sectionTitle("Kapitteltest"));
  children.push(
    bodyText("Svar på oppgavene. Hver oppgave gir 1 poeng. Skriv på linjene under hvert spørsmål.", {
      italics: true,
      color: C.teal,
      size: 20
    })
  );
  for (const t of arbeidshefte.kapitteltest) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: 80, line: 276 },
        keepNext: true,
        children: [
          new TextRun({ text: `${t.nummer}. `, bold: true, color: C.amber, size: 22, font: "Calibri" }),
          new TextRun({ text: t.innhold, color: C.night, size: 21, font: "Calibri" })
        ]
      })
    );
    children.push(...writingLines(2));
  }

  children.push(pageBreak());
  children.push(sectionTitle("Fasit"));
  children.push(
    bodyText("Til lærer / egenkontroll. Elevene bør ikke se denne delen før oppgavene er gjort.", {
      italics: true,
      color: C.teal,
      size: 20
    })
  );
  for (const line of arbeidshefte.fasit.split(/\n+/)) {
    if (line.trim()) {
      children.push(bodyText(line.trim()));
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: MARGIN,
              bottom: MARGIN,
              left: MARGIN,
              right: MARGIN
            }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `MBO · Kap. ${kapittel.nummer} · ${kapittel.yrke}`,
                    color: C.teal,
                    size: 14,
                    font: "Calibri",
                    italics: true
                  })
                ]
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: "Side ", color: C.teal, size: 14, font: "Calibri" }),
                  new TextRun({ children: [PageNumber.CURRENT], color: C.teal, size: 14, font: "Calibri" }),
                  new TextRun({ text: " · Molde voksenopplæringssenter", color: C.teal, size: 14, font: "Calibri" })
                ]
              })
            ]
          })
        },
        children
      }
    ]
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
