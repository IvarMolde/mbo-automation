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
import type { ArbeidshefteData, Kapittel, Oppgave, TekstSeksjon } from "./types.js";

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

function isDeloppgaveLine(line: string): boolean {
  return /^\d{1,2}[a-eA-E]\b/.test(line) || /^[a-eA-E]\)\s/.test(line);
}

function oppgaveContentParagraphs(innhold: string, oppgaveNummer: number): Paragraph[] {
  const lines = splitOppgaveInnhold(innhold, oppgaveNummer);
  return lines.map((line, index) => {
    const isOption = isDeloppgaveLine(line);
    const isLast = index === lines.length - 1;
    return new Paragraph({
      spacing: { after: isOption ? 140 : 120, line: 300 },
      indent: isOption ? { left: 160 } : undefined,
      keepLines: true,
      keepNext: !isLast,
      children: [
        new TextRun({
          text: line,
          color: C.night,
          size: 21,
          font: "Calibri",
          bold: isOption
        })
      ]
    });
  });
}

function oppgaveBlock(oppgave: Oppgave): Array<Paragraph | Table> {
  const needsLines = /skriv|muntlig|oppsummer/i.test(`${oppgave.type} ${oppgave.tittel}`);
  const num = String(oppgave.nummer).padStart(2, "0");

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
                  spacing: { after: 60 },
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
                  spacing: { after: 120 },
                  keepNext: true,
                  keepLines: true,
                  children: [
                    new TextRun({
                      text: typeLabel(oppgave.type),
                      italics: true,
                      color: C.teal,
                      size: 16,
                      font: "Calibri"
                    })
                  ]
                }),
                ...oppgaveContentParagraphs(oppgave.innhold, oppgave.nummer),
                ...(needsLines ? writingLines(4) : []),
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
    ...learningGoals(kapittel)
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
    bodyText("Svar på oppgavene. Hver oppgave gir 1 poeng.", {
      italics: true,
      color: C.teal,
      size: 20
    })
  );
  for (const t of arbeidshefte.kapitteltest) {
    children.push(
      new Paragraph({
        spacing: { after: 140, line: 276 },
        children: [
          new TextRun({ text: `${t.nummer}. `, bold: true, color: C.amber, size: 22, font: "Calibri" }),
          new TextRun({ text: t.innhold, color: C.night, size: 21, font: "Calibri" })
        ]
      })
    );
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
