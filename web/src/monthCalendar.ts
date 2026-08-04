import { getIsoWeekNumber } from "./isoWeek";

const MONTH_NB = [
  "Januar",
  "Februar",
  "Mars",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Desember"
] as const;

const WEEKDAYS_NB = ["Ma", "Ti", "On", "To", "Fr", "Lø", "Sø"] as const;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Mandag = 0 … Søndag = 6 (ISO-rekkefølge). */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export type MonthCalendarCell = {
  date: Date;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  week: number;
};

export type MonthCalendarModel = {
  year: number;
  month: number; // 0–11
  title: string;
  weekdays: readonly string[];
  /** Rader: hver rad er én uke (7 dager), med ukenummer fra mandagen. */
  rows: Array<{ week: number; days: MonthCalendarCell[] }>;
};

export function buildMonthCalendar(ref: Date = new Date()): MonthCalendarModel {
  const today = startOfDay(new Date());
  const year = ref.getFullYear();
  const month = ref.getMonth();
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - mondayIndex(first));

  const rows: MonthCalendarModel["rows"] = [];
  let cursor = new Date(start);

  for (let r = 0; r < 6; r += 1) {
    const days: MonthCalendarCell[] = [];
    for (let c = 0; c < 7; c += 1) {
      days.push({
        date: new Date(cursor),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === month,
        isToday: sameDay(cursor, today),
        week: getIsoWeekNumber(cursor)
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    rows.push({ week: days[0]!.week, days });
  }

  while (rows.length > 4 && rows[rows.length - 1]!.days.every((d) => !d.inMonth)) {
    rows.pop();
  }

  return {
    year,
    month,
    title: `${MONTH_NB[month]} ${year}`,
    weekdays: WEEKDAYS_NB,
    rows
  };
}

export function renderMonthCalendarHtml(escapeHtml: (s: string) => string, ref?: Date): string {
  const model = buildMonthCalendar(ref ?? new Date());
  const head = model.weekdays
    .map((d) => `<span class="mcal-dow" aria-hidden="true">${d}</span>`)
    .join("");

  const body = model.rows
    .map((row) => {
      const cells = row.days
        .map((cell) => {
          const classes = [
            "mcal-day",
            cell.inMonth ? "is-in-month" : "is-out-month",
            cell.isToday ? "is-today" : ""
          ]
            .filter(Boolean)
            .join(" ");
          const label = cell.isToday
            ? `I dag ${cell.day}. ${model.title}`
            : `${cell.day}. ${model.title}`;
          return `<span class="${classes}" aria-label="${escapeHtml(label)}" ${
            cell.isToday ? 'aria-current="date"' : ""
          }><span class="mcal-day-num">${cell.day}</span></span>`;
        })
        .join("");
      return `
        <div class="mcal-row">
          <span class="mcal-week" title="Skoleuke ${row.week}">${row.week}</span>
          <div class="mcal-days">${cells}</div>
        </div>`;
    })
    .join("");

  return `
    <aside class="month-cal" aria-label="Månedskalender for ${escapeHtml(model.title)}">
      <p class="month-cal-title">${escapeHtml(model.title)}</p>
      <div class="mcal-grid">
        <div class="mcal-row mcal-head">
          <span class="mcal-week mcal-week-label" title="Ukenummer">Uke</span>
          <div class="mcal-days">${head}</div>
        </div>
        ${body}
      </div>
      <p class="month-cal-legend muted">Lys grønn sirkel = i dag</p>
    </aside>`;
}
