export const DEFAULT_TEXT_STYLE = {
  font: "Arial",
  size: 24,
  bold: false,
  color: "000000",
} as const;

export const DEFAULT_HEADING_STYLE = {
  ...DEFAULT_TEXT_STYLE,
  bold: true,
} as const;

export const LINE_SPACING_ONE_AND_HALF = 360;
export const LEFT_INDENT = 720;
export const TASK_INDENT = 1440;
export const LIGHT_TABLE_BACKGROUND = "F5F7FB";
export const LIGHT_HEADER_BACKGROUND = "EAF2FF";

export const DEFAULT_PARAGRAPH_SPACING = {
  line: LINE_SPACING_ONE_AND_HALF,
  lineRule: "auto" as const,
  before: 60,
  after: 120,
};
