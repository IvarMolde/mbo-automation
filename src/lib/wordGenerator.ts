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
import type {
  ArbeidshefteData,
  GrammatikkForklaring,
  HverdagsmatematikkData,
  Kapittel,
  Oppgave,
  TekstSeksjon
} from "./types.js";
import {
  ekstraNivaLabel,
  type EkstraOppgaverData
} from "./ekstraOppgaverTypes.js";

/** MBO design tokens (pedagogisk Word-mal 2026). WCAG: mørkere amber for hvit tekst. */
const C = {
  marine: "003057",
  teal: "005F73",
  amber: "A65C00",
  amberSoft: "EE9B00",
  night: "001219",
  softTeal: "E6F2F4",
  softAmber: "FFF6E5",
  softGray: "F5F7F8",
  white: "FFFFFF",
  line: "D0D7DE"
} as const;

/** Hele dokumentet: Arial 12 pt (docx size = halvpoint). */
const FONT = "Arial";
const SZ = 24;

const PAGE_WIDTH = 11906; // A4 twips
const MARGIN = 1134; // ~2 cm
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const noBorder = { style: BorderStyle.NONE, size: SZ, color: "FFFFFF" };
const thinLine = { style: BorderStyle.SINGLE, size: SZ, color: C.line };
const tealLeft = { style: BorderStyle.SINGLE, size: SZ, color: C.teal };
const amberLeft = { style: BorderStyle.SINGLE, size: SZ, color: C.amber };

function run(
  text: string,
  opts?: { bold?: boolean; color?: string; size?: number }
): TextRun {
  return new TextRun({
    text,
    bold: opts?.bold,
    color: opts?.color ?? C.night,
    size: opts?.size ?? SZ,
    font: FONT
  });
}

function spacer(after = 120): Paragraph {
  return new Paragraph({ spacing: { after }, children: [] });
}

function sectionTitle(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 140 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: SZ, color: C.teal, space: 4 }
    },
    children: [run(text, { bold: true, color: C.marine })]
  });
}

function bodyText(text: string, opts?: { bold?: boolean; color?: string }): Paragraph {
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    children: [run(text, { bold: opts?.bold, color: opts?.color ?? C.night })]
  });
}

function metaLabel(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      run(`${label}: `, { bold: true, color: C.teal }),
      run(value, { color: C.night })
    ]
  });
}

function humanizeTypeKey(type: string): string {
  const spaced = type.replace(/_/g, " ").trim();
  if (!spaced) return type;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    lareverk: "Tema",
    yrke: "Yrke",
    yrke_arbeidsnorsk: "Yrke",
    arbeidsnorsk: "Arbeidsnorsk",
    hverdagssituasjon: "Hverdagssituasjon",
    hverdagsmatematikk: "Hverdagsmatematikk",
    grammatikk: "Grammatikk",
    fyll_inn_setningsstruktur: "Fyll inn setningsstruktur",
    leseforstaelse: "Leseforståelse",
    skriveoppgave: "Skriveoppgave",
    muntlig: "Muntlig"
  };
  return map[type] ?? humanizeTypeKey(type);
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
                    size: SZ,
                    font: FONT
                  })
                ]
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Arbeid og norsk – MBO",
                    color: C.white,
                    size: SZ,
                    font: FONT
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
                  new TextRun({ text: `Skoleuke ${uke}`, bold: true, color: C.white, size: SZ, font: FONT })
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
                    size: SZ,
                    font: FONT
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
          size: SZ,
          font: FONT
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
          size: SZ,
          font: FONT
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
          color: C.teal,
          size: SZ,
          font: FONT
        })
      ]
    }),
    ...goals.map(
      (g) =>
        new Paragraph({
          spacing: { after: 80 },
          indent: { left: 120 },
          children: [
            new TextRun({ text: "▸  ", color: C.amber, size: SZ, font: FONT }),
            new TextRun({ text: g, color: C.night, size: SZ, font: FONT })
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
          children: [new TextRun({ text: p, color: C.night, size: SZ, font: FONT })]
        })
    );

  const eksempelParas = g.eksempler.map(
    (ex, i) =>
      new Paragraph({
        spacing: { after: 80, line: 276 },
        indent: { left: 120 },
        keepLines: true,
        children: [
          new TextRun({ text: `${i + 1}. `, bold: true, color: C.teal, size: SZ, font: FONT }),
          new TextRun({ text: ex, color: C.night, size: SZ, font: FONT })
        ]
      })
  );

  const tipParas = g.huskeregel
    ? [
        new Paragraph({
          spacing: { before: 120, after: 60 },
          keepNext: true,
          children: [
            new TextRun({ text: "Huskeregel", bold: true, color: C.amber, size: SZ, font: FONT })
          ]
        }),
        new Paragraph({
          spacing: { after: 40 },
          keepLines: true,
          children: [new TextRun({ text: g.huskeregel, color: C.night, size: SZ, font: FONT })]
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
                      size: SZ,
                      font: FONT
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
                      size: SZ,
                      font: FONT
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
                    size: SZ,
                    font: FONT
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
                    size: SZ,
                    font: FONT
                  })
                ]
              }),
              ...seksjon.tekst.split(/\n+/).filter(Boolean).map((line) =>
                new Paragraph({
                  spacing: { after: 100, line: 300 },
                  keepLines: true,
                  children: [
                    new TextRun({ text: line.trim(), color: C.night, size: SZ, font: FONT })
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
      spacing: { before: 80, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: SZ, color: C.night, space: 1 }
      },
      children: [run(" ")]
    })
  );
}

/**
 * Split task body so deloppgaver always start on their own line as «a. …», «b. …».
 * Also normalizes older «1a» / «M1a» / «a)» markers.
 */
export function splitOppgaveInnhold(raw: string, _oppgaveNummer?: number): string[] {
  let text = raw.replace(/\r\n/g, "\n").trim();
  // M1a / M2b → letter
  text = text.replace(/(?:^|[ \t]+)M\d([a-gA-G])\s*[\)\.]?\s+/gm, "\n§$1§ ");
  // Already labeled: "1a)", "1a.", "1a " → letter
  text = text.replace(/(?:^|[ \t]+)(\d{1,2})([a-gA-G])\s*[\)\.]?\s+/gm, "\n§$2§ ");
  // Plain letters: "a)", "b." → placeholder
  text = text.replace(/(?:^|[ \t]+)([a-gA-G])\s*[\)\.]\s+/gm, "\n§$1§ ");
  // Mid-sentence: "...tekst. a) ..." or "...tekst. 1a) ..."
  text = text.replace(/([.!?:,;])\s*(?:\d{1,2})?([a-gA-G])\s*[\)\.]?\s+/g, "$1\n§$2§ ");
  // Numbered list items (1) 2) …) that are not lettered deloppgaver
  text = text.replace(/(?:^|[ \t]+)(\d{1,2})\s*[\)\.]\s+/gm, "\n$1. ");

  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const lettered = trimmed.match(/^§([a-gA-G])§\s*(.*)$/);
      if (lettered) {
        const letter = lettered[1]!.toLowerCase();
        const rest = lettered[2]!.trim();
        return rest ? `${letter}. ${rest}` : `${letter}.`;
      }
      return trimmed;
    })
    .filter(Boolean);
}

function isDeloppgaveLine(line: string): boolean {
  return /^[a-g]\.\s/.test(line) || /^[a-g]\.$/.test(line);
}

function isSantUsantOppgave(oppgave: Oppgave): boolean {
  const blob = `${oppgave.type} ${oppgave.tittel} ${oppgave.innhold}`;
  return /sant\s*(eller|\/)\s*usant|true\s*\/\s*false/i.test(blob);
}

function isCheckboxOppgave(oppgave: Oppgave): boolean {
  if (isSantUsantOppgave(oppgave)) return true;
  const blob = `${oppgave.type} ${oppgave.tittel} ${oppgave.innhold}`;
  return /flervalg|kryss\s*av|sett\s*kryss|avkryss/i.test(blob);
}

function isSkrivOppgave(oppgave: Oppgave): boolean {
  return /skriv|muntlig|oppsummer|fyll_inn|leseforstaelse|regne|svar/i.test(
    `${oppgave.type} ${oppgave.tittel}`
  );
}

function deloppgaveParagraph(line: string, opts?: { keepNext?: boolean }): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: 276 },
    indent: { left: 120 },
    keepLines: true,
    keepNext: opts?.keepNext,
    children: [run(line, { bold: true })]
  });
}

function santUsantRow(line: string): Paragraph {
  const rest = line.replace(/^[a-g]\.\s*/, "").trim();
  const letter = line.match(/^([a-g])\./)?.[1] ?? "";
  return new Paragraph({
    spacing: { after: 120, line: 276 },
    indent: { left: 120 },
    keepLines: true,
    children: [
      run(`${letter}. ${rest}    `, { bold: true }),
      run("Sant ☐    Usant ☐")
    ]
  });
}

function checkboxOptionRow(line: string): Paragraph {
  return new Paragraph({
    spacing: { after: 100, line: 276 },
    indent: { left: 120 },
    keepLines: true,
    children: [run(`${line}    ☐`, { bold: true })]
  });
}

function oppgaveContentParagraphs(oppgave: Oppgave): Paragraph[] {
  const lines = splitOppgaveInnhold(oppgave.innhold, oppgave.nummer);
  const santUsant = isSantUsantOppgave(oppgave);
  const checkbox = isCheckboxOppgave(oppgave);
  const skriv = isSkrivOppgave(oppgave) && !checkbox;
  const out: Paragraph[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const isOption = isDeloppgaveLine(line);
    const isLast = i === lines.length - 1;

    if (!isOption) {
      out.push(
        new Paragraph({
          spacing: { after: 120, line: 276 },
          keepLines: true,
          keepNext: !isLast,
          children: [run(line, { bold: /^(les|skriv|kryss|bruk|regn)/i.test(line) })]
        })
      );
      continue;
    }

    if (santUsant) {
      out.push(santUsantRow(line));
      continue;
    }
    if (checkbox) {
      out.push(checkboxOptionRow(line));
      continue;
    }

    out.push(deloppgaveParagraph(line, { keepNext: skriv || !isLast }));
    if (skriv) {
      // Én svarlinje per deloppgave (skriveoppgaver: selve linjen er svaret).
      out.push(...writingLines(/skriv/i.test(oppgave.type) ? 1 : 1));
    }
  }

  // Skriveoppgave uten bokstavdeler: legg til linjer under instruksen.
  if (skriv && !lines.some(isDeloppgaveLine)) {
    out.push(...writingLines(4));
  }

  return out;
}

function oppgaveBlock(oppgave: Oppgave): Array<Paragraph | Table> {
  const num = String(oppgave.nummer).padStart(2, "0");

  const block: Array<Paragraph | Table> = [
    spacer(280),
    new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: [720, CONTENT_WIDTH - 720],
      rows: [
        new TableRow({
          cantSplit: true,
          children: [
            cell(
              [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [run(num, { bold: true, color: C.white })]
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
                  children: [run(oppgave.tittel, { bold: true, color: C.marine })]
                }),
                new Paragraph({
                  spacing: { after: 120 },
                  keepNext: true,
                  keepLines: true,
                  children: [run(typeLabel(oppgave.type), { color: C.teal })]
                }),
                ...oppgaveContentParagraphs(oppgave),
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
        [new Paragraph({ children: [new TextRun({ text: "Ord", bold: true, color: C.white, size: SZ, font: FONT })] })],
        c1,
        { shading: C.marine, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine } }
      ),
      cell(
        [new Paragraph({ children: [new TextRun({ text: "Forklaring", bold: true, color: C.white, size: SZ, font: FONT })] })],
        c2,
        { shading: C.marine, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine } }
      ),
      cell(
        [new Paragraph({ children: [new TextRun({ text: "Eksempel", bold: true, color: C.white, size: SZ, font: FONT })] })],
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
          [new Paragraph({ children: [new TextRun({ text: o.ord, bold: true, color: C.marine, size: SZ, font: FONT })] })],
          c1,
          { shading: fill, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine }, align: VerticalAlign.TOP }
        ),
        cell(
          [new Paragraph({ children: [new TextRun({ text: o.forklaring, color: C.night, size: SZ, font: FONT })] })],
          c2,
          { shading: fill, borders: { top: thinLine, bottom: thinLine, left: thinLine, right: thinLine }, align: VerticalAlign.TOP }
        ),
        cell(
          [new Paragraph({ children: [new TextRun({ text: o.eksempel, color: C.night, size: SZ, font: FONT })] })],
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

function matteMalList(label: string, mal: string[]): Array<Paragraph | Table> {
  return [
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({ text: label, bold: true, color: C.teal, size: SZ, font: FONT })
      ]
    }),
    ...mal.map(
      (m) =>
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 120 },
          children: [
            new TextRun({ text: "▸  ", color: C.amber, size: SZ, font: FONT }),
            new TextRun({ text: m, color: C.night, size: SZ, font: FONT })
          ]
        })
    )
  ];
}

function hverdagsmatematikkSection(matte: HverdagsmatematikkData): Array<Paragraph | Table> {
  const fagtekstSeksjon: TekstSeksjon = {
    nummer: 1,
    type: "hverdagsmatematikk",
    tittel: matte.tittel,
    tekst: matte.fagtekst,
    oppgaver: []
  };

  const out: Array<Paragraph | Table> = [
    spacer(200),
    sectionTitle("Hverdagsmatematikk"),
    bodyText(`Hovedkategori denne uken: ${matte.kategoriLabel}. Samme tema som norsk-delen. Les fagteksten først — tallene der brukes i oppgavene.`, { color: C.teal }),
    ...matteMalList("Denne uken øver du (nivå 1) på å:", matte.malNiva1),
    ...matteMalList("Og (nivå 2) på å:", matte.malNiva2),
    spacer(80),
    textBox(fagtekstSeksjon),
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: "Oppgaver — nivå 1",
          bold: true,
          color: C.marine,
          size: SZ,
          font: FONT
        })
      ]
    }),
    bodyText("Enkle, konkrete oppgaver. Bruk tallene i fagteksten.", {
      color: C.teal
    })
  ];

  for (const oppgave of matte.niva1) {
    out.push(...oppgaveBlock(oppgave));
  }

  out.push(
    new Paragraph({
      spacing: { before: 160, after: 80 },
      children: [
        new TextRun({
          text: "Oppgaver — nivå 2",
          bold: true,
          color: C.marine,
          size: SZ,
          font: FONT
        })
      ]
    }),
    bodyText("Samme situasjon, mer krevende regning. Fortsett å bruke fagteksten.", {
      color: C.teal
    })
  );

  for (const oppgave of matte.niva2) {
    out.push(...oppgaveBlock(oppgave));
  }

  return out;
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
            size: SZ,
            font: FONT
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
      color: C.teal
    })
  );
  children.push(vocabularyTable(arbeidshefte));

  children.push(sectionTitle("Kapitteltest"));
  children.push(
    bodyText("Svar på oppgavene. Hver oppgave gir 1 poeng.", { color: C.teal })
  );
  for (const t of arbeidshefte.kapitteltest) {
    children.push(
      new Paragraph({
        spacing: { after: 140, line: 276 },
        children: [
          new TextRun({ text: `${t.nummer}. `, bold: true, color: C.amber, size: SZ, font: FONT }),
          new TextRun({ text: t.innhold, color: C.night, size: SZ, font: FONT })
        ]
      })
    );
  }

  children.push(...hverdagsmatematikkSection(arbeidshefte.hverdagsmatematikk));

  children.push(pageBreak());
  children.push(sectionTitle("Fasit"));
  children.push(
    bodyText("Til lærer / egenkontroll. Elevene bør ikke se denne delen før oppgavene er gjort.", { color: C.teal })
  );
  children.push(
    new Paragraph({
      spacing: { before: 80, after: 60 },
      children: [
        new TextRun({ text: "Norsk", bold: true, color: C.marine, size: SZ, font: FONT })
      ]
    })
  );
  for (const line of arbeidshefte.fasit.split(/\n+/)) {
    if (line.trim()) {
      children.push(bodyText(line.trim()));
    }
  }
  children.push(
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({
          text: "Hverdagsmatematikk",
          bold: true,
          color: C.marine,
          size: SZ,
          font: FONT
        })
      ]
    })
  );
  for (const line of arbeidshefte.hverdagsmatematikk.fasit.split(/\n+/)) {
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
                    size: SZ,
                    font: FONT
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
                  new TextRun({ text: "Side ", color: C.teal, size: SZ, font: FONT }),
                  new TextRun({ children: [PageNumber.CURRENT], color: C.teal, size: SZ, font: FONT }),
                  new TextRun({ text: " · Molde voksenopplæringssenter", color: C.teal, size: SZ, font: FONT })
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

export async function genererWordEkstra(
  kapittel: Kapittel,
  data: EkstraOppgaverData,
  uke: number
): Promise<Buffer> {
  const nivaLabel = ekstraNivaLabel[data.niva];

  const children: Array<Paragraph | Table> = [
    headerBar(kapittel, uke),
    spacer(160),
    new Paragraph({
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `Ekstraoppgaver · ${nivaLabel}`,
          bold: true,
          color: C.amber,
          size: SZ,
          font: FONT
        })
      ]
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: kapittel.yrke,
          bold: true,
          color: C.marine,
          size: SZ,
          font: FONT
        })
      ]
    }),
    metaLabel("Skoleuke", String(uke)),
    metaLabel("Kapittel", `${kapittel.nummer}`),
    metaLabel("Grammatikk", kapittel.grammatikk),
    metaLabel("Nivå", nivaLabel),
    bodyText(
      "Dette er ekstra trening i tillegg til hovedheftet. Oppgavene følger samme oppsett, tilpasset nivået.",
      { color: C.teal }
    ),
    spacer(80)
  ];

  for (const seksjon of data.tekstSeksjoner) {
    children.push(spacer(120));
    children.push(textBox(seksjon));
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 80 },
        children: [
          new TextRun({
            text: `Oppgaver til tekst ${seksjon.nummer}`,
            bold: true,
            color: C.marine,
            size: SZ,
            font: FONT
          })
        ]
      })
    );
    for (const oppgave of seksjon.oppgaver) {
      children.push(...oppgaveBlock(oppgave));
    }
  }

  if (data.grammatikk) {
    children.push(
      bodyText(
        "Grammatikk: Les forklaringen først. Den forteller hva grammatikken gjør, og hvorfor den er nyttig i norsk.",
        { color: C.teal }
      )
    );
    children.push(...grammatikkSection(data.grammatikk.forklaring));
    children.push(sectionTitle("Eksempeltekst med grammatikk"));
    children.push(
      textBox({
        nummer: 1,
        type: "grammatikk",
        tittel: data.grammatikk.eksempeltekst.tittel,
        tekst: data.grammatikk.eksempeltekst.tekst,
        oppgaver: []
      })
    );
    children.push(
      new Paragraph({
        spacing: { before: 140, after: 80 },
        children: [
          new TextRun({
            text: "Oppgaver til grammatikk",
            bold: true,
            color: C.marine,
            size: SZ,
            font: FONT
          })
        ]
      })
    );
    for (const oppgave of data.grammatikk.oppgaver) {
      children.push(...oppgaveBlock(oppgave));
    }
  }

  children.push(pageBreak());
  children.push(sectionTitle("Fasit"));
  children.push(
    bodyText("Til lærer / egenkontroll.", { color: C.teal })
  );
  for (const line of data.fasit.split(/\n+/)) {
    if (line.trim()) children.push(bodyText(line.trim()));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }
          }
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `MBO · Ekstra · ${nivaLabel} · Kap. ${kapittel.nummer}`,
                    color: C.teal,
                    size: SZ,
                    font: FONT
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
                  new TextRun({ text: "Side ", color: C.teal, size: SZ, font: FONT }),
                  new TextRun({ children: [PageNumber.CURRENT], color: C.teal, size: SZ, font: FONT }),
                  new TextRun({
                    text: " · Molde voksenopplæringssenter",
                    color: C.teal,
                    size: SZ,
                    font: FONT
                  })
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
