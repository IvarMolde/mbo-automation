import planJson from "../../data/arsplan-2026-2027.json";
import { getIsoWeekNumber, getIsoWeekYear } from "./isoWeek";
import {
  getLocalEffectiveUker,
  loadLocalPlanState,
  saveLocalPlanState
} from "./localPlan";
import { buildUkeVisninger, escapeHtml, findUke, toArsplanDokument } from "./plan";
import { computeEffectiveSchedule, type PlanOperation, type PlanState } from "./schedule";
import type { ArsplanDokument, EffectiveUke, PlanApiResponse, UkeVisning, ViewId } from "./types";
import { renderShell, renderUkeCard } from "./ui";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "https://mbo-automation-b8bi.vercel.app";

const SESSION_KEY = "mbo-admin-session-v1";

/**
 * Vedlikehold: Oppdater DOCS_UPDATED hver gang «Om»- eller «Veiledning»-teksten
 * endres, og hold begge forklaringene i tråd med nye funksjoner i appen.
 */
const APP_FASE = "Fase 2";
const DOCS_UPDATED = "23. juli 2026";

const app = document.querySelector<HTMLDivElement>("#app");

let plan: ArsplanDokument = planJson as ArsplanDokument;
let effectiveUker: EffectiveUke[] | undefined;
let apiMeta: PlanApiResponse["store"] | null = null;
let apiStateUpdatedAt: string | null = null;
let planOperations: PlanState["operations"] = [];
let loadError: string | null = null;
/** local = endringer i nettleseren, server = Turso/API, base = grunnplan */
let planSource: "local" | "server" | "base" = "base";
/** Statusmelding på Admin som overlever re-render */
let adminFlash: string | null = null;
/** Uken som er valgt i «Tilpass yrke og grammatikk», overlever re-render */
let customizeUke: number | null = null;

type RecipientRow = {
  email: string;
  name?: string;
  active: boolean;
  addedAt: string;
};

let recipients: RecipientRow[] = [];
let recipientsError: string | null = null;
let recipientsLoading = false;
let recipientsFetched = false;

function parseView(): { view: ViewId; periode?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [raw, query = ""] = hash.split("?");
  const view = (raw || "oversikt") as ViewId;
  const params = new URLSearchParams(query);
  const periode = params.get("m") ?? undefined;
  // «Perioder» er slått sammen med «Nå»; behold gamle lenker ved å omdirigere.
  if (view === "perioder") {
    return { view: "denne-uken" };
  }
  if (
    view === "oversikt" ||
    view === "denne-uken" ||
    view === "veiledning" ||
    view === "om" ||
    view === "admin"
  ) {
    return { view, periode };
  }
  return { view: "oversikt" };
}

function getSessionToken(): string {
  return localStorage.getItem(SESSION_KEY) ?? "";
}

function setSessionToken(token: string): void {
  if (token) localStorage.setItem(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

function isLoggedIn(): boolean {
  return Boolean(getSessionToken());
}

function applyLocalSchedule(): void {
  const local = loadLocalPlanState();
  if (local.operations.some((op) => op.type !== "reset")) {
    effectiveUker = getLocalEffectiveUker(plan);
    planOperations = local.operations;
    planSource = "local";
    return;
  }
  if (!effectiveUker) {
    effectiveUker = computeEffectiveSchedule(plan).uker;
    planSource = "base";
  }
}

function adoptServerPlan(data: PlanApiResponse): void {
  plan = toArsplanDokument(data);
  apiMeta = data.store;
  apiStateUpdatedAt = data.state.updatedAt;
  planOperations = data.state.operations as PlanState["operations"];
  effectiveUker = data.effective.uker;
  planSource = data.effective.hasChanges ? "server" : "base";
  const synced: PlanState = {
    version: 1,
    updatedAt: data.state.updatedAt,
    operations: planOperations
  };
  saveLocalPlanState(synced);
}

async function refreshPlanFromApi(): Promise<void> {
  loadError = null;
  try {
    const res = await fetch(`${API_BASE}/api/plan`);
    if (!res.ok) throw new Error(`API svarte ${res.status}`);
    const data = (await res.json()) as PlanApiResponse;
    if (!data.success) throw new Error("Ugyldig plansvar");

    // Innlogget: server er sannheten (cron/e-post følger den).
    if (isLoggedIn()) {
      adoptServerPlan(data);
      return;
    }

    plan = toArsplanDokument(data);
    apiMeta = data.store;
    apiStateUpdatedAt = data.state.updatedAt;
    planOperations = data.state.operations as PlanState["operations"];

    const local = loadLocalPlanState();
    const localHasChanges = local.operations.some((op) => op.type !== "reset");
    if (data.effective.hasChanges && !localHasChanges) {
      effectiveUker = data.effective.uker;
      planSource = "server";
    } else if (localHasChanges) {
      effectiveUker = getLocalEffectiveUker(plan);
      planOperations = local.operations;
      planSource = "local";
    } else {
      effectiveUker = data.effective.uker;
      planSource = "base";
    }
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Kunne ikke hente dynamisk plan";
    apiMeta = null;
    plan = planJson as ArsplanDokument;
    applyLocalSchedule();
  }
}

async function runPlanAction(op: PlanOperation): Promise<string | null> {
  if (!isLoggedIn()) {
    return "Du må logge inn først.";
  }
  if (!apiMeta?.writable) {
    return "Serverplan er ikke skrivbar (mangler Turso).";
  }

  const path =
    op.type === "lock"
      ? "/api/plan/lock"
      : op.type === "unlock"
        ? "/api/plan/unlock"
        : op.type === "shift"
          ? "/api/plan/shift"
          : op.type === "overrideWeek"
            ? "/api/plan/override-week"
            : op.type === "clearWeekOverride"
              ? "/api/plan/clear-week-override"
              : "/api/plan/reset";
  const body =
    op.type === "lock"
      ? { uke: op.uke, note: op.note }
      : op.type === "unlock"
        ? { uke: op.uke }
        : op.type === "shift"
          ? { fromUke: op.fromUke, weeks: op.weeks, note: op.note }
          : op.type === "overrideWeek"
            ? { uke: op.uke, note: op.note, yrke: op.yrke, grammatikk: op.grammatikk }
            : op.type === "clearWeekOverride"
              ? { uke: op.uke }
              : {};

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSessionToken()}`
      },
      body: JSON.stringify(body)
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      state?: PlanState;
      effective?: { uker: EffectiveUke[]; hasChanges?: boolean };
    };
    if (res.status === 401) {
      setSessionToken("");
      return "Økten er utløpt. Logg inn på nytt.";
    }
    if (!res.ok || !data.success || !data.state || !data.effective) {
      return data.error ?? `Serverfeil (${res.status})`;
    }
    saveLocalPlanState(data.state);
    planOperations = data.state.operations;
    effectiveUker = data.effective.uker;
    planSource = "server";
    apiStateUpdatedAt = data.state.updatedAt;
    return null;
  } catch {
    return "Kunne ikke nå serveren. Prøv igjen.";
  }
}

async function loginWithPassword(password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/plan/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      sessionToken?: string;
    };
    if (!res.ok || !data.success || !data.sessionToken) {
      return data.error ?? "Innlogging feilet.";
    }
    setSessionToken(data.sessionToken);
    await refreshPlanFromApi();
    await refreshRecipients();
    return null;
  } catch {
    return "Kunne ikke nå serveren.";
  }
}

function logout(): void {
  setSessionToken("");
  recipients = [];
  recipientsError = null;
  recipientsFetched = false;
  adminFlash = "Du er logget ut.";
}

async function refreshRecipients(): Promise<void> {
  if (!isLoggedIn()) {
    recipients = [];
    recipientsFetched = false;
    return;
  }
  recipientsLoading = true;
  recipientsError = null;
  try {
    const res = await fetch(`${API_BASE}/api/recipients`, {
      headers: { Authorization: `Bearer ${getSessionToken()}` }
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      recipients?: RecipientRow[];
    };
    if (res.status === 401) {
      setSessionToken("");
      recipients = [];
      recipientsFetched = false;
      recipientsError = "Økten er utløpt. Logg inn på nytt.";
      return;
    }
    if (!res.ok || !data.success || !data.recipients) {
      recipientsError = data.error ?? `Kunne ikke hente mottakere (${res.status})`;
      recipientsFetched = true;
      return;
    }
    recipients = data.recipients;
    recipientsFetched = true;
  } catch {
    recipientsError = "Kunne ikke hente mottakerlisten.";
    recipientsFetched = true;
  } finally {
    recipientsLoading = false;
  }
}

async function addRecipientEmail(email: string, name?: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/recipients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSessionToken()}`
      },
      body: JSON.stringify({ email, name })
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      recipients?: RecipientRow[];
    };
    if (!res.ok || !data.success || !data.recipients) {
      return data.error ?? "Kunne ikke legge til mottaker.";
    }
    recipients = data.recipients;
    return null;
  } catch {
    return "Kunne ikke nå serveren.";
  }
}

async function removeRecipientEmail(email: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/recipients`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSessionToken()}`
      },
      body: JSON.stringify({ email })
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      recipients?: RecipientRow[];
    };
    if (!res.ok || !data.success || !data.recipients) {
      return data.error ?? "Kunne ikke fjerne mottaker.";
    }
    recipients = data.recipients;
    return null;
  } catch {
    return "Kunne ikke nå serveren.";
  }
}

async function sendHefteManualWithMessage(input: {
  uke: number;
  mode: "all" | "one";
  motaker?: string;
}): Promise<{ error: string | null; detail?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/hefte/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getSessionToken()}`
      },
      body: JSON.stringify(input)
    });
    const data = (await res.json()) as {
      success?: boolean;
      error?: string;
      message?: string;
      sentTo?: string[];
      kapittel?: number;
      uke?: number;
    };
    if (res.status === 401) {
      setSessionToken("");
      return { error: "Økten er utløpt. Logg inn på nytt." };
    }
    if (!res.ok || !data.success) {
      return { error: data.error ?? `Sending feilet (${res.status})` };
    }
    const to = data.sentTo?.join(", ") ?? "";
    return {
      error: null,
      detail: `Sendt uke ${data.uke} (kap. ${data.kapittel}) til: ${to}`
    };
  } catch {
    return {
      error: "Kunne ikke nå serveren. Vent gjerne 2 min og sjekk innboksen før du prøver igjen."
    };
  }
}

function currentWeekLabel(): string {
  const uke = getIsoWeekNumber();
  const year = getIsoWeekYear();
  const match = findUke(plan, uke, effectiveUker);
  if (match?.status === "locked") {
    return `ISO-uke ${uke} (${year}) · låst`;
  }
  if (match?.kapittel) {
    return `ISO-uke ${uke} (${year}) · Kap. ${match.kapittel.nummer} ${match.kapittel.yrke}`;
  }
  if (match?.status === "empty") {
    return `ISO-uke ${uke} (${year}) · innhenting`;
  }
  return `ISO-uke ${uke} (${year}) · ikke i inneværende skoleårsplan`;
}

interface PlanChangeCounts {
  locked: number;
  empty: number;
  tilpasset: number;
  flyttet: number;
  total: number;
}

function planChangeCounts(): PlanChangeCounts {
  const uker = effectiveUker ?? [];
  const locked = uker.filter((u) => u.status === "locked").length;
  const empty = uker.filter((u) => u.status === "empty").length;
  const tilpasset = uker.filter((u) => Boolean(u.tilpasset)).length;
  const flyttet = uker.filter(
    (u) => u.endret && u.status === "teaching" && !u.tilpasset
  ).length;
  return { locked, empty, tilpasset, flyttet, total: locked + empty + tilpasset + flyttet };
}

function formatUpdatedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Tydelig markør som forteller læreren om de ser grunnplanen (fasiten)
 * eller en gjeldende, tilpasset plan — og hvor mye som er endret.
 */
function renderPlanStatus(opts: { showLegend?: boolean } = {}): string {
  const c = planChangeCounts();
  const changed = c.total > 0 || planSource !== "base";
  const updated = formatUpdatedAt(apiStateUpdatedAt);

  const breakdown = changed
    ? `<ul class="plan-status-breakdown">
        ${c.locked ? `<li><span class="badge badge-lock">Låst</span> ${c.locked} ${c.locked === 1 ? "uke" : "uker"}</li>` : ""}
        ${c.flyttet ? `<li><span class="badge badge-changed">Endret</span> ${c.flyttet} ${c.flyttet === 1 ? "uke" : "uker"}</li>` : ""}
        ${c.tilpasset ? `<li><span class="badge badge-tilpasset">Tilpasset</span> ${c.tilpasset} ${c.tilpasset === 1 ? "uke" : "uker"}</li>` : ""}
        ${c.empty ? `<li><span class="badge badge-empty">Innhenting</span> ${c.empty} ${c.empty === 1 ? "uke" : "uker"}</li>` : ""}
      </ul>`
    : "";

  const legend = opts.showLegend
    ? `<ul class="legend-list compact plan-status-legend">
        <li><span class="badge badge-lock">Låst</span> ferie</li>
        <li><span class="badge badge-tilpasset">Tilpasset</span> yrke/grammatikk</li>
        <li><span class="badge badge-empty">Innhenting</span> etter forskyvning</li>
        <li><span class="badge badge-changed">Endret</span> kapittel flyttet</li>
      </ul>`
    : "";

  return `
    <div class="panel plan-status ${changed ? "is-changed" : "is-base"}" role="status">
      <div class="plan-status-head">
        <span class="plan-status-pill">${changed ? "Gjeldende plan" : "Grunnplan"}</span>
        <p class="plan-status-lead">${
          changed
            ? `${c.total} ${c.total === 1 ? "endring" : "endringer"} fra grunnplanen.`
            : "Ingen endringer ennå — dette er fasiten for skoleåret."
        }</p>
      </div>
      ${breakdown}
      <p class="plan-status-help muted">
        ${changed ? `Grunnplanen er uendret som fasit. ` : ""}${updated ? `Sist endret ${escapeHtml(updated)}. ` : ""}<a href="#/veiledning">Hva betyr dette?</a>
      </p>
      ${legend}
    </div>`;
}

function renderOversikt(filterManed?: string): string {
  const uker = buildUkeVisninger(plan, effectiveUker);
  const perioder = filterManed
    ? plan.perioder.filter((p) => p.maned === filterManed)
    : plan.perioder;

  const banner = loadError
    ? `<div class="panel note" role="status">Kunne ikke hente oppdatert plan akkurat nå. API-varsel: ${escapeHtml(loadError)}.</div>${renderPlanStatus({ showLegend: true })}`
    : renderPlanStatus({ showLegend: true });

  if (!perioder.length) {
    return `${banner}<p role="status">Fant ingen periode som matcher.</p>`;
  }

  // Include extended weeks (forlenget) not in original period lists
  const listed = new Set(perioder.flatMap((p) => p.uker));
  const extra = uker.filter((u) => !listed.has(u.uke));

  return (
    banner +
    perioder
      .map((periode) => {
        const rows = uker.filter((u) => periode.uker.includes(u.uke));
        return `
        <section class="periode-block" aria-labelledby="periode-${escapeHtml(periode.maned)}">
          <div class="periode-head">
            <h2 id="periode-${escapeHtml(periode.maned)}">${escapeHtml(periode.maned)}</h2>
            <p>${escapeHtml(periode.fokus)}</p>
            <p class="muted">Uke ${periode.ukeStart}–${periode.ukeSlutt} · Kapittel ${periode.kapitler.join(", ")}</p>
          </div>
          <div class="uke-list">
            ${rows.map((u) => renderUkeCard(u)).join("")}
          </div>
        </section>
      `;
      })
      .join("") +
    (extra.length
      ? `<section class="periode-block">
          <div class="periode-head"><h2>Forlenget / forskjøvet</h2>
          <p class="muted">Uker lagt til etter lås eller forskyvning.</p></div>
          <div class="uke-list">${extra.map((u) => renderUkeCard(u)).join("")}</div>
        </section>`
      : "")
  );
}

function weekHeadline(u: UkeVisning): string {
  if (u.status === "locked") return "Ferie / låst uke";
  if (u.status === "empty") return "Innhenting (uten nytt kapittel)";
  const k = u.kapittel;
  return k ? escapeHtml(k.yrke || k.tittel) : "Uten kapittel";
}

function weekStatusClass(u: UkeVisning): string {
  if (u.status === "locked") return "status-locked";
  if (u.status === "empty") return "status-empty";
  if (u.tilpasset) return "status-tilpasset";
  if (u.endret) return "status-changed";
  return "status-teaching";
}

function renderWeekSummaryCard(
  u: UkeVisning | undefined,
  role: "prev" | "now" | "next"
): string {
  const roleLabel = role === "prev" ? "Forrige uke" : role === "now" ? "Denne uken" : "Neste uke";
  if (!u) {
    return `
      <article class="week-summary is-${role} is-empty-slot">
        <p class="week-role">${roleLabel}</p>
        <p class="muted">Utenfor skoleåret.</p>
      </article>
    `;
  }
  const k = u.kapittel;
  const gram = k ? escapeHtml(k.grammatikk) : "—";
  const kapLine = k ? `Kapittel ${k.nummer} · ${escapeHtml(k.tittel)}` : "";
  const jump = `#/oversikt?m=${encodeURIComponent(u.maned || "")}`;
  return `
    <article class="week-summary is-${role} ${weekStatusClass(u)}">
      <p class="week-role">${roleLabel}</p>
      <p class="week-num">Uke ${u.uke}<span class="week-maned">${escapeHtml(u.maned || "")}</span></p>
      <h3 class="week-headline">${weekHeadline(u)}</h3>
      ${k ? `<p class="week-gram"><span class="week-gram-label">Grammatikk</span> ${gram}</p>` : ""}
      ${kapLine ? `<p class="muted week-kap">${kapLine}</p>` : ""}
      <p class="week-badges">${
        [
          u.status === "locked" ? `<span class="badge badge-lock">Låst</span>` : "",
          u.status === "empty" ? `<span class="badge badge-empty">Innhenting</span>` : "",
          u.tilpasset ? `<span class="badge badge-tilpasset">Tilpasset</span>` : "",
          u.endret && u.status === "teaching" && !u.tilpasset
            ? `<span class="badge badge-changed">Endret</span>`
            : ""
        ]
          .filter(Boolean)
          .join(" ") || `<span class="muted">Følger grunnplanen</span>`
      }</p>
      <a class="week-jump" href="${jump}">Se i årsplanen →</a>
    </article>
  `;
}

function renderCalendarGrid(uker: UkeVisning[]): string {
  const byUke = new Map(uker.map((u) => [u.uke, u]));
  const listed = new Set<number>();

  const months = plan.perioder
    .map((periode) => {
      const chips = periode.uker
        .map((uke) => byUke.get(uke))
        .filter((u): u is UkeVisning => Boolean(u));
      chips.forEach((c) => listed.add(c.uke));
      if (!chips.length) return "";
      return `
        <div class="cal-month">
          <a class="cal-month-name" href="#/oversikt?m=${encodeURIComponent(periode.maned)}">
            ${escapeHtml(periode.maned)}
            <span class="cal-month-uke">Uke ${periode.ukeStart}–${periode.ukeSlutt}</span>
          </a>
          ${periode.fokus ? `<p class="cal-month-fokus muted">${escapeHtml(periode.fokus)}</p>` : ""}
          <div class="cal-weeks">
            ${chips.map(renderCalendarChip).join("")}
          </div>
        </div>`;
    })
    .join("");

  const extra = uker.filter((u) => !listed.has(u.uke));
  const extraBlock = extra.length
    ? `
      <div class="cal-month">
        <p class="cal-month-name">Forlenget / forskjøvet</p>
        <div class="cal-weeks">${extra.map(renderCalendarChip).join("")}</div>
      </div>`
    : "";

  return `<div class="cal-grid">${months}${extraBlock}</div>`;
}

function renderCalendarChip(u: UkeVisning): string {
  const jump = `#/oversikt?m=${encodeURIComponent(u.maned || "")}`;
  const short =
    u.status === "locked"
      ? "Ferie"
      : u.status === "empty"
        ? "Innhenting"
        : u.kapittel
          ? escapeHtml(u.kapittel.yrke || u.kapittel.tittel)
          : "—";
  const title = `Uke ${u.uke}: ${short}`;
  return `
    <a
      class="cal-week ${weekStatusClass(u)}${u.erDagensUke ? " is-current" : ""}"
      href="${jump}"
      title="${title}"
      ${u.erDagensUke ? 'aria-current="date"' : ""}
    >
      <span class="cal-week-num">Uke ${u.uke}</span>
      <span class="cal-week-yrke">${short}</span>
      ${u.erDagensUke ? `<span class="cal-week-here">Du er her</span>` : ""}
    </a>
  `;
}

function renderDenneUken(): string {
  const uke = getIsoWeekNumber();
  const year = getIsoWeekYear();
  const uker = buildUkeVisninger(plan, effectiveUker);
  const idx = uker.findIndex((u) => u.uke === uke);
  const match = idx >= 0 ? uker[idx] : findUke(plan, uke, effectiveUker);

  const outsidePlan = idx < 0 && !match;
  const hero = `
    <div class="panel highlight now-hero">
      <p class="now-kicker">Der vi er nå</p>
      <p class="now-week">ISO-uke ${uke} <span class="now-year">· ${year}</span></p>
      <p class="lede">${
        outsidePlan
          ? `Uke ${uke} er utenfor skoleåret ${escapeHtml(plan.metadata.skolear ?? "")}. Se hele årsplanen nedenfor.`
          : "Rask oversikt over forrige, inneværende og neste uke — pluss hele skoleåret."
      }</p>
    </div>`;

  const status = renderPlanStatus();

  const strip = outsidePlan
    ? ""
    : `
    <section class="week-strip" aria-label="Forrige, denne og neste uke">
      ${renderWeekSummaryCard(idx > 0 ? uker[idx - 1] : undefined, "prev")}
      ${renderWeekSummaryCard(match, "now")}
      ${renderWeekSummaryCard(idx >= 0 && idx < uker.length - 1 ? uker[idx + 1] : undefined, "next")}
    </section>`;

  const detail = match ? `<section class="now-detail">${renderUkeCard(match, true)}</section>` : "";

  const calendar = `
    <section class="cal-section" aria-label="Kalender for hele skoleåret">
      <div class="cal-head">
        <h2>Kalender · hele skoleåret</h2>
        <p class="muted">Fargene viser status. Klikk en uke eller et månedsnavn for å hoppe til måneden i årsplanen.</p>
      </div>
      ${renderCalendarGrid(uker)}
      <ul class="legend-list compact cal-legend">
        <li><span class="cal-swatch status-teaching"></span> Undervisning</li>
        <li><span class="cal-swatch status-locked"></span> Ferie / låst</li>
        <li><span class="cal-swatch status-empty"></span> Innhenting</li>
        <li><span class="cal-swatch status-tilpasset"></span> Tilpasset</li>
        <li><span class="cal-swatch status-changed"></span> Endret</li>
      </ul>
    </section>`;

  return `${hero}${status}${strip}${detail}${calendar}`;
}

function renderOm(): string {
  const m = plan.metadata;
  const niva = m.norskniva?.length ? m.norskniva.join(", ") : "—";
  return `
    <div class="panel prose help-box">
      <h2>Hva er dette?</h2>
      <p>
        Dette er planleggings- og publiseringsverktøyet for årsplanen i
        <strong>${escapeHtml(m.kurs ?? "Arbeid og norsk")}</strong> ved
        ${escapeHtml(m.organisasjon ?? "Molde voksenopplæring")}. Verktøyet holder
        oversikt over hva klassen skal jobbe med hver uke gjennom hele skoleåret, lar deg
        tilpasse planen når hverdagen endrer seg, og lager og sender ukentlige arbeidshefter
        automatisk — slik at du bruker mindre tid på administrasjon og mer tid på undervisning.
      </p>
    </div>

    <div class="panel prose">
      <h2>Kort om planen</h2>
      <dl class="meta-grid">
        <div><dt>Tittel</dt><dd>${escapeHtml(m.tittel)}</dd></div>
        <div><dt>Kurs</dt><dd>${escapeHtml(m.kurs ?? "—")}</dd></div>
        <div><dt>Organisasjon</dt><dd>${escapeHtml(m.organisasjon ?? "—")}</dd></div>
        ${m.samarbeidspartner ? `<div><dt>Samarbeidspartner</dt><dd>${escapeHtml(m.samarbeidspartner)}</dd></div>` : ""}
        <div><dt>Skoleår</dt><dd>${escapeHtml(m.skolear ?? "—")}</dd></div>
        <div><dt>Målgruppe</dt><dd>${escapeHtml(m.malgruppe ?? "—")}</dd></div>
        <div><dt>Norsknivå</dt><dd>${escapeHtml(niva)}</dd></div>
        <div><dt>Antall kapitler</dt><dd>${m.antallKapitler ?? plan.kapitler.length}</dd></div>
      </dl>
      ${m.notat ? `<p class="muted">${escapeHtml(m.notat)}</p>` : ""}
    </div>

    <div class="panel prose">
      <h2>Slik fungerer verktøyet</h2>

      <h3>1. Grunnplan og gjeldende plan</h3>
      <p>
        <strong>Grunnplanen</strong> er den opprinnelige årsplanen (uke for uke) og ligger
        fast som «fasit». Den <strong>gjeldende planen</strong> er det som gjelder akkurat nå —
        etter at du eventuelt har låst ferieuker, forskjøvet innhold eller tilpasset enkeltuker.
        Du overskriver aldri grunnplanen; alle endringer er sporbare og kan tilbakestilles.
      </p>

      <h3>2. «Nå» — kalender og ukesoverblikk</h3>
      <p>
        Under <a href="#/denne-uken">Nå</a> ser du <em>forrige</em>, <em>inneværende</em> og
        <em>neste</em> uke ved siden av hverandre, full detalj for uken vi er i, og en fargekodet
        kalender for hele skoleåret. Da er det lett å se hvor dere er, hva som var, og hva som kommer.
      </p>

      <h3>3. Årsplan</h3>
      <p>
        <a href="#/oversikt">Årsplan</a> viser alle ukene med kapittel, yrke, grammatikk, nivå,
        tematekster og oppgaver. Vil du hoppe rett til en måned? Klikk månedsnavnet i kalenderen
        under <a href="#/denne-uken">Nå</a>.
      </p>

      <h3>4. Automatisk ukehefte</h3>
      <p>
        Hver uke lager verktøyet et arbeidshefte for gjeldende kapittel — tekst og oppgaver
        genereres med KI (Google Gemini) og pakkes i et Word-dokument (.docx) som sendes på e-post
        til mottakerne. Den faste utsendingen skjer automatisk hver onsdag.
      </p>

      <h3>5. Tilpasning underveis</h3>
      <p>
        I <a href="#/admin">Admin</a> kan du <strong>låse ferieuker</strong>,
        <strong>forskyve planen</strong> når klassen trenger mer tid, og
        <strong>tilpasse yrke og grammatikk</strong> for enkeltuker med rullegardinmeny.
        Du kan også <strong>sende et hefte manuelt</strong> for en valgt uke, f.eks. for å
        forberede deg i forkant, og <strong>styre hvem som mottar</strong> heftet.
      </p>

      <h3>6. Innlogging og lagring</h3>
      <p>
        Redigering krever innlogging med admin-passord. Økten huskes i nettleseren i inntil 30 dager,
        så du slipper å hente nøkler hver gang. Endringer lagres sentralt på server, slik at både
        oversikten og den automatiske utsendingen følger samme, oppdaterte plan.
      </p>
    </div>

    <div class="panel prose">
      <h2>Litt om teknikken</h2>
      <p>
        Nettsiden er en lettvekts app (TypeScript/Vite) som publiseres via GitHub Pages.
        Selve motoren — planlagring, KI-generering, Word-fil og e-post — kjører som et API på Vercel
        med en planlagt jobb (cron) for onsdagsutsendingen. Data lagres i en database (Turso).
        Sensitive nøkler ligger som miljøvariabler og vises aldri i nettleseren.
      </p>
      <p class="muted">Versjon: ${escapeHtml(APP_FASE)} · Denne teksten sist oppdatert ${escapeHtml(DOCS_UPDATED)}.</p>
    </div>
  `;
}

function renderVeiledning(): string {
  return `
    <div class="panel prose help-box">
      <h2>Kom raskt i gang</h2>
      <p>
        Denne veiledningen forklarer hva du kan gjøre i verktøyet, steg for steg. Du trenger ikke
        være innlogget for å <em>se</em> planen — men for å <em>endre</em> noe (låse uker, forskyve,
        tilpasse, sende hefte, styre mottakere) må du logge inn under <a href="#/admin">Admin</a>.
      </p>
      <ul class="help-steps">
        <li><strong>Vil du se hvor dere er?</strong> Gå til <a href="#/denne-uken">Nå</a>.</li>
        <li><strong>Vil du se hele skoleåret?</strong> Gå til <a href="#/oversikt">Årsplan</a>.</li>
        <li><strong>Vil du endre noe?</strong> Logg inn under <a href="#/admin">Admin</a>.</li>
      </ul>
    </div>

    <div class="panel prose">
      <h2>Grunnplan vs. gjeldende plan</h2>
      <dl class="meta-grid">
        <div>
          <dt>Grunnplan</dt>
          <dd>Den opprinnelige årsplanen (uke for uke). Dette er «fasiten» og endres aldri av deg.</dd>
        </div>
        <div>
          <dt>Gjeldende plan</dt>
          <dd>Det som gjelder nå, etter at du har låst ferieuker, forskjøvet eller tilpasset uker.</dd>
        </div>
      </dl>
      <p class="muted">Alt du gjør kan tilbakestilles til grunnplanen når som helst.</p>
      <div class="help-text">
        <p><strong>Hvordan ser jeg hvilken plan jeg ser på?</strong> Øverst på <a href="#/denne-uken">Nå</a> og <a href="#/oversikt">Årsplan</a> står en markør:</p>
        <p>• <span class="plan-status-pill">Grunnplan</span> betyr at ingenting er endret ennå — du ser fasiten.</p>
        <p>• <span class="plan-status-pill" style="background:var(--amber);color:#fff;border-color:var(--amber)">Gjeldende plan</span> betyr at planen er tilpasset, og markøren viser hvor mange uker som er låst, endret, tilpasset eller satt til innhenting.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>Fanene i menyen</h2>
      <div class="help-text">
        <p><strong>Nå</strong> — forrige, inneværende og neste uke side om side, pluss en fargekodet kalender for hele skoleåret. Klikk et månedsnavn for å hoppe til måneden i Årsplan. Din daglige startside.</p>
        <p><strong>Årsplan</strong> — alle ukene med kapittel, yrke, grammatikk, nivå, tematekster og oppgaver. Åpne en uke for full detalj.</p>
        <p><strong>Admin</strong> — logg inn for å endre planen og styre utsending.</p>
        <p><strong>Om</strong> — bakgrunn og hvordan verktøyet fungerer under panseret.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>1. Logg inn</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Før du skal endre noe som helst.</p>
        <p><strong>Hvordan?</strong> Gå til <a href="#/admin">Admin</a>, skriv inn admin-passordet, og trykk «Logg inn». Økten huskes i denne nettleseren i inntil 30 dager, så du slipper å logge inn hver gang.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>2. Lås uke</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Når det ikke skal være undervisning: høstferie, jul, vinterferie, 1. mai, 17. mai.</p>
        <p><strong>Hva skjer?</strong> Uken merkes <span class="badge badge-lock">Låst</span>. Kapitler som lå der, flyttes til neste ledige uke. Planen hopper over ferien.</p>
        <p><strong>Eksempel:</strong> Lås uke 40 som høstferie → innholdet fra uke 40 kommer i uke 41 (eller neste ulåste uke).</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>3. Lås opp uke</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Hvis du låste feil uke, eller ferien ble flyttet.</p>
        <p><strong>Hva skjer?</strong> Ferie-merket fjernes. Innhold trekkes ikke automatisk tilbake. Bruk forskyvning eller tilbakestill hvis du vil rydde planen.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>4. Forskyv plan</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Klassen ble ikke ferdig med et emne og trenger mer tid.</p>
        <p><strong>Hva skjer?</strong> Fra valgt uke og fremover skyves kapitlene frem. De første ukene blir <span class="badge badge-empty">Innhenting</span> (ingen nytt kapittel). Låste uker hoppes over.</p>
        <p><strong>Eksempel:</strong> Fra uke 36, 1 uke frem → uke 36 blir innhenting, og kapittelet som sto der flyttes til neste ledige uke.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>5. Tilpass yrke og grammatikk</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Når du vil bytte yrke og/eller grammatikk for én uke, uten å endre grunnplanen.</p>
        <p><strong>Hvordan?</strong> I Admin velger du uke og bruker rullegardinmenyene for yrke og grammatikk. Velg «Bruk kapitlets standard» for å nullstille et felt.</p>
        <p><strong>Hvordan vet jeg at det ble lagret?</strong> Etter lagring blir uken stående valgt med de nye verdiene, du får en bekreftelse, og uken dukker opp i listen «Tilpassede uker» der du også kan redigere eller nullstille den.</p>
        <p><strong>Hva skjer?</strong> Uken merkes <span class="badge badge-tilpasset">Tilpasset</span>, og både oversikten og heftet som sendes for uken bruker de nye valgene.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>6. Send hefte manuelt</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Når du vil forberede deg i forkant, i stedet for å vente på den automatiske onsdagsutsendingen.</p>
        <p><strong>Hvordan?</strong> Velg uke, velg om det skal sendes til bare deg eller alle aktive mottakere, og trykk «Send hefte». Det kan ta 1–2 minutter (KI lager innhold + Word-fil).</p>
        <p class="muted">Den faste onsdagsutsendingen fortsetter uansett som normalt.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>7. E-postmottakere</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Når flere skal motta ukeheftet, eller noen skal fjernes.</p>
        <p><strong>Hvordan?</strong> Legg til navn og e-post i mottakerlisten i Admin. Alle aktive adresser får onsdagsheftet, og hver e-post har egen avmeldingslenke.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>8. Tilbakestill</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Bare hvis du vil slette alle lås, forskyvninger og tilpasninger.</p>
        <p><strong>Obs:</strong> Da er du tilbake til grunnplanen. Handlingen kan ikke angres.</p>
      </div>
    </div>

    <div class="panel prose help-box">
      <h2>Merkene og fargene</h2>
      <ul class="legend-list">
        <li><span class="badge badge-now">Denne uken</span> — inneværende ISO-uke</li>
        <li><span class="badge badge-lock">Låst</span> — ferie / ingen undervisning</li>
        <li><span class="badge badge-tilpasset">Tilpasset</span> — yrke eller grammatikk er endret for uken</li>
        <li><span class="badge badge-empty">Innhenting</span> — ekstra tid etter forskyvning</li>
        <li><span class="badge badge-changed">Endret</span> — kapittelet er flyttet fra grunnplanen</li>
      </ul>
      <p>De samme fargene brukes i kalenderen under <a href="#/denne-uken">Nå</a>.</p>
      <p class="after-link"><a class="btn" href="#/admin">Gå til Admin og prøv</a></p>
      <p class="muted">Veiledningen sist oppdatert ${escapeHtml(DOCS_UPDATED)} (${escapeHtml(APP_FASE)}).</p>
    </div>
  `;
}

function lockedWeekNotes(): Map<number, string | undefined> {
  const notes = new Map<number, string | undefined>();
  for (const op of planOperations) {
    if (op.type === "reset") {
      notes.clear();
      continue;
    }
    if (op.type === "lock") notes.set(op.uke, op.note);
    if (op.type === "unlock") notes.delete(op.uke);
  }
  return notes;
}

function renderLockedWeeksPanel(): string {
  const locked = (effectiveUker ?? []).filter((u) => u.status === "locked");
  const notes = lockedWeekNotes();
  const syncHint = !isLoggedIn()
    ? "Logg inn for å endre planen. Alle ser den lagrede serverplanen."
    : apiMeta?.writable
      ? "Du er innlogget. Endringer lagres på server og gjelder for onsdagens hefte."
      : "Du er innlogget, men serverplan er ikke skrivbar (Turso mangler).";

  if (locked.length === 0) {
    return `
      <div class="panel highlight locked-summary" id="locked-summary">
        <h2>Låste uker nå</h2>
        <p class="lede">Ingen uker er låst ennå.</p>
        <p class="muted">${escapeHtml(syncHint)}</p>
        ${adminFlash && isLoggedIn() ? `<p class="admin-flash" role="status">${escapeHtml(adminFlash)}</p>` : ""}
      </div>
    `;
  }

  const items = locked
    .map((u) => {
      const note = notes.get(u.uke);
      return `<li>
        <a href="#/oversikt">Uke ${u.uke}</a>
        <span class="badge badge-lock">Låst</span>
        ${note ? ` — ${escapeHtml(note)}` : ""}
        <span class="muted"> · ${escapeHtml(u.maned || "")}</span>
      </li>`;
    })
    .join("");

  return `
    <div class="panel highlight locked-summary" id="locked-summary">
      <h2>Låste uker nå (${locked.length})</h2>
      <p class="lede">Disse ukene er markert som ferie / uten undervisning:</p>
      <ul class="locked-list">${items}</ul>
      <p class="muted">${escapeHtml(syncHint)}</p>
      <p><a class="btn" href="#/oversikt">Se dem i Oversikt</a></p>
      ${adminFlash && isLoggedIn() ? `<p class="admin-flash" role="status">${escapeHtml(adminFlash)}</p>` : ""}
    </div>
  `;
}

function renderRecipientsPanel(): string {
  const active = recipients.filter((r) => r.active);
  const inactive = recipients.filter((r) => !r.active);
  const rows =
    recipients.length === 0
      ? `<p class="muted">${recipientsLoading ? "Henter mottakere…" : "Ingen mottakere ennå. Legg til minst én e-post."}</p>`
      : `<ul class="recipient-list">
          ${active
            .map(
              (r) => `<li>
                <span><strong>${escapeHtml(r.email)}</strong>${
                  r.name ? ` · ${escapeHtml(r.name)}` : ""
                }</span>
                <button type="button" class="btn btn-ghost recipient-remove" data-email="${escapeHtml(r.email)}">Fjern</button>
              </li>`
            )
            .join("")}
          ${inactive
            .map(
              (r) => `<li class="is-inactive">
                <span><strong>${escapeHtml(r.email)}</strong> <span class="badge">Avmeldt</span></span>
                <button type="button" class="btn btn-ghost recipient-remove" data-email="${escapeHtml(r.email)}">Slett</button>
              </li>`
            )
            .join("")}
        </ul>`;

  return `
    <div class="panel highlight" id="recipients-panel">
      <h2>E-postmottakere (${active.length} aktive)</h2>
      <p class="lede">Onsdagens hefte sendes til alle aktive adresser under. Hver e-post har også avmeldingslenke.</p>
      ${recipientsError ? `<p class="admin-flash" role="status">${escapeHtml(recipientsError)}</p>` : ""}
      ${rows}
      <form id="recipient-add-form" class="admin-form recipient-add">
        <label for="recipient-email">Ny e-postadresse</label>
        <input id="recipient-email" name="email" type="email" required placeholder="navn@example.com" />
        <label for="recipient-name">Navn (valgfritt)</label>
        <input id="recipient-name" name="name" type="text" maxlength="120" placeholder="F.eks. Kari" />
        <button type="submit" class="btn">Legg til mottaker</button>
      </form>
    </div>
  `;
}

function weekSendPreview(uke: number): string {
  const row = (effectiveUker ?? []).find((u) => u.uke === uke);
  if (!row) return "Uken finnes ikke i inneværende årsplan.";
  if (row.status === "locked") return "Låst uke (ferie) — kan ikke sende hefte.";
  if (row.status === "empty") return "Tom/innhentingsuke — kan ikke sende hefte.";
  const kap = plan.kapitler.find((k) => k.nummer === row.kapittelNummer);
  if (!kap) return `Kapittel ${row.kapittelNummer ?? "?"} (mangler detaljer)`;
  const yrke = row.overrideYrke ?? kap.yrke;
  const gram = row.overrideGrammatikk ?? kap.grammatikk;
  const tip = row.tilpasset ? " · tilpasset" : "";
  return `Kap. ${kap.nummer} — ${yrke} · ${gram}${tip}`;
}

function catalogOptions(kind: "yrke" | "grammatikk"): string[] {
  const values = plan.kapitler.map((k) => (kind === "yrke" ? k.yrke : k.grammatikk)).filter(Boolean);
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "nb"));
}

function renderCustomizedWeeksList(): string {
  const tilpassede = (effectiveUker ?? []).filter((u) => u.tilpasset);
  if (!tilpassede.length) {
    return `<p class="muted custom-empty">Ingen uker er tilpasset ennå. Endringene dine vil vises her.</p>`;
  }
  const items = tilpassede
    .map((u) => {
      const baseKap =
        u.kapittelNummer != null ? plan.kapitler.find((k) => k.nummer === u.kapittelNummer) : undefined;
      const yrke = u.overrideYrke
        ? `<span class="custom-field"><span class="custom-field-label">Yrke</span> ${escapeHtml(u.overrideYrke)}</span>`
        : "";
      const gram = u.overrideGrammatikk
        ? `<span class="custom-field"><span class="custom-field-label">Grammatikk</span> ${escapeHtml(u.overrideGrammatikk)}</span>`
        : "";
      const baseHint = baseKap
        ? `<span class="muted custom-base">Grunnplan: ${escapeHtml(baseKap.yrke)} · ${escapeHtml(baseKap.grammatikk)}</span>`
        : "";
      return `<li>
        <div class="custom-item-main">
          <strong>Uke ${u.uke}</strong> <span class="badge badge-tilpasset">Tilpasset</span>
          <div class="custom-fields">${yrke}${gram}</div>
          ${baseHint}
        </div>
        <div class="custom-item-actions">
          <button type="button" class="btn btn-ghost custom-edit" data-uke="${u.uke}">Rediger</button>
          <button type="button" class="btn btn-ghost custom-reset" data-uke="${u.uke}">Nullstill</button>
        </div>
      </li>`;
    })
    .join("");
  return `<ul class="custom-list">${items}</ul>`;
}

function renderCustomizePanel(): string {
  const selectedUke = customizeUke ?? getIsoWeekNumber();
  const row = (effectiveUker ?? []).find((u) => u.uke === selectedUke);
  const baseKap = row?.kapittelNummer != null
    ? plan.kapitler.find((k) => k.nummer === row.kapittelNummer)
    : undefined;
  const selectedYrke = row?.overrideYrke ?? "";
  const selectedGram = row?.overrideGrammatikk ?? "";
  const isTilpasset = Boolean(row?.tilpasset);

  const yrkeOpts = catalogOptions("yrke")
    .map(
      (y) =>
        `<option value="${escapeHtml(y)}"${y === selectedYrke ? " selected" : ""}>${escapeHtml(y)}</option>`
    )
    .join("");
  const gramOpts = catalogOptions("grammatikk")
    .map(
      (g) =>
        `<option value="${escapeHtml(g)}"${g === selectedGram ? " selected" : ""}>${escapeHtml(g)}</option>`
    )
    .join("");

  const statusLine = isTilpasset
    ? `<p class="custom-status is-active" role="status">Uke ${selectedUke} er tilpasset. Valgene under viser hva som gjelder nå.</p>`
    : `<p class="custom-status" role="status">Uke ${selectedUke} følger grunnplanen. Velg yrke og/eller grammatikk for å tilpasse.</p>`;

  return `
    <div class="panel highlight" id="customize-panel">
      <h2>Tilpass yrke og grammatikk</h2>
      <p class="lede">
        Velg en uke, og bytt yrke og/eller grammatikk med rullegardinmeny.
        Endringen gjelder oversikten og heftet som sendes for den uken.
      </p>
      <form id="customize-form" class="admin-form send-hefte-form">
        <label for="custom-uke">Velg uke å tilpasse</label>
        <input id="custom-uke" name="uke" type="number" min="1" max="53" required value="${selectedUke}" />
        <p class="muted" id="custom-uke-preview">${escapeHtml(weekSendPreview(selectedUke))}</p>
        ${statusLine}

        <label for="custom-yrke">Yrke</label>
        <select id="custom-yrke" name="yrke">
          <option value="">Bruk kapitlets standard${baseKap ? ` (${escapeHtml(baseKap.yrke)})` : ""}</option>
          ${yrkeOpts}
        </select>

        <label for="custom-grammatikk">Grammatikk</label>
        <select id="custom-grammatikk" name="grammatikk">
          <option value="">Bruk kapitlets standard${baseKap ? ` (${escapeHtml(baseKap.grammatikk)})` : ""}</option>
          ${gramOpts}
        </select>

        <label for="custom-note">Notat (valgfritt)</label>
        <input id="custom-note" name="note" type="text" maxlength="300" placeholder="F.eks. Klassen vil jobbe med renhold" />

        <div class="btn-row">
          <button type="submit" class="btn">Lagre tilpasning</button>
          <button type="button" class="btn btn-ghost" id="custom-clear">Nullstill denne uken</button>
        </div>
      </form>

      <h3 class="custom-list-title">Tilpassede uker</h3>
      ${renderCustomizedWeeksList()}
    </div>
  `;
}

function defaultSendEmail(): string {
  const active = recipients.find((r) => r.active);
  return active?.email ?? "";
}

function renderSendHeftePanel(): string {
  const ukeNow = getIsoWeekNumber();
  const defaultEmail = escapeHtml(defaultSendEmail());
  return `
    <div class="panel highlight" id="send-hefte-panel">
      <h2>Send hefte nå</h2>
      <p class="lede">
        Generer og send arbeidsheftet for en valgt uke — f.eks. for å forberede deg i forkant.
        Den automatiske onsdagsutsendingen fortsetter som før.
      </p>
      <form id="send-hefte-form" class="admin-form send-hefte-form">
        <label for="send-uke">ISO-uke</label>
        <input id="send-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <p class="muted" id="send-uke-preview">${escapeHtml(weekSendPreview(ukeNow))}</p>

        <fieldset class="send-mode">
          <legend>Hvem skal motta?</legend>
          <label class="radio-row">
            <input type="radio" name="mode" value="one" checked />
            Kun denne adressen (anbefalt for forberedelse)
          </label>
          <label for="send-motaker" class="sr-only">E-postadresse</label>
          <input id="send-motaker" name="motaker" type="email" value="${defaultEmail}" placeholder="din@epost.no" />
          <label class="radio-row">
            <input type="radio" name="mode" value="all" />
            Alle aktive mottakere (${recipients.filter((r) => r.active).length})
          </label>
        </fieldset>

        <button type="submit" class="btn">Send hefte</button>
        <p class="muted">Kan ta 1–2 minutter (Gemini lager innhold + Word-fil).</p>
      </form>
    </div>
  `;
}

function renderAdmin(): string {
  const ukeNow = getIsoWeekNumber();

  if (!isLoggedIn()) {
    return `
      <div class="panel prose help-box">
        <h2>Logg inn for å redigere planen</h2>
        <p>
          Skriv inn admin-passordet ditt. Økten huskes i denne nettleseren i opptil 30 dager,
          så du slipper å hente nøkler fra Vercel hver gang.
        </p>
      </div>
      <form id="admin-login-form" class="panel admin-form login-form">
        <label for="admin-password">Admin-passord</label>
        <input id="admin-password" name="password" type="password" autocomplete="current-password" required minlength="12" />
        <button type="submit" class="btn">Logg inn</button>
        ${adminFlash ? `<p class="admin-flash" role="status">${escapeHtml(adminFlash)}</p>` : ""}
      </form>
      ${renderLockedWeeksPanel()}
    `;
  }

  return `
    <div class="panel prose help-box">
      <h2>Admin — tilpass planen</h2>
      <p>
        Du er innlogget. Endringer lagres på serveren og synes i listen under og i
        <a href="#/oversikt">Oversikt</a> med merket <span class="badge badge-lock">Låst</span>.
      </p>
      <p class="muted">
        ${apiStateUpdatedAt ? `Sist oppdatert på server: ${escapeHtml(apiStateUpdatedAt)}. ` : ""}
        <button type="button" class="btn btn-ghost" id="admin-logout">Logg ut</button>
      </p>
    </div>

    ${renderLockedWeeksPanel()}

    ${renderCustomizePanel()}

    ${renderSendHeftePanel()}

    ${renderRecipientsPanel()}

    <div class="admin-grid">
      <form id="lock-form" class="panel admin-form">
        <h2>Lås uke</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Ferie og helligdager uten undervisning.</p>
          <p><strong>Hva skjer?</strong> Uken blir <em>Låst</em>. Innhold flyttes til neste ledige uke.</p>
        </div>
        <label for="lock-uke">Ukenummer (ISO-uke)</label>
        <input id="lock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="lock-note">Notat (valgfritt)</label>
        <input id="lock-note" name="note" type="text" maxlength="300" placeholder="F.eks. Høstferie" />
        <button type="submit" class="btn">Lås uke</button>
      </form>

      <form id="unlock-form" class="panel admin-form">
        <h2>Lås opp uke</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Feil låst uke, eller ferien ble endret.</p>
          <p><strong>Hva skjer?</strong> Ferie-merket fjernes. Innhold trekkes ikke automatisk tilbake.</p>
        </div>
        <label for="unlock-uke">Ukenummer (ISO-uke)</label>
        <input id="unlock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <button type="submit" class="btn">Lås opp</button>
      </form>

      <form id="shift-form" class="panel admin-form">
        <h2>Forskyv plan</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Dere trenger mer tid på et emne.</p>
          <p><strong>Hva skjer?</strong> Kapitler fra valgt uke skyves frem. Første uker blir <em>Innhenting</em>.</p>
        </div>
        <label for="shift-from">Fra uke (der dere trenger mer tid)</label>
        <input id="shift-from" name="fromUke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="shift-weeks">Hvor mange uker skal planen skyves frem?</label>
        <input id="shift-weeks" name="weeks" type="number" min="1" max="20" required value="1" />
        <label for="shift-note">Notat (valgfritt)</label>
        <input id="shift-note" name="note" type="text" maxlength="300" placeholder="F.eks. Trenger mer tid på grammatikk" />
        <button type="submit" class="btn">Forskyv</button>
      </form>

      <form id="reset-form" class="panel admin-form">
        <h2>Tilbakestill</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Bare hvis du vil slette alle lås og forskyvninger.</p>
          <p><strong>Obs:</strong> Kan ikke angres.</p>
        </div>
        <button type="submit" class="btn btn-danger">Tilbakestill til grunnplan</button>
      </form>
    </div>
  `;
}

function pageCopy(view: ViewId, periode?: string): { title: string; subtitle: string } {
  switch (view) {
    case "denne-uken":
      return {
        title: "Nå",
        subtitle: "Forrige, denne og neste uke — og kalender for hele skoleåret."
      };
    case "veiledning":
      return {
        title: "Veiledning",
        subtitle: "Steg-for-steg: se planen, logg inn, lås, forskyv, tilpass og send hefte."
      };
    case "om":
      return {
        title: "Om verktøyet",
        subtitle: "Hva programmet gjør, hvordan det fungerer og hvordan planen henger sammen."
      };
    case "admin":
      return {
        title: "Admin — tilpass planen",
        subtitle: isLoggedIn()
          ? "Lås ferieuker, forskyv undervisning og administrer e-postmottakere."
          : "Logg inn med admin-passord for å redigere planen."
      };
    default:
      return {
        title: periode ? `Årsplan · ${periode}` : "Årsplan uke for uke",
        subtitle: "Kompakt oversikt over gjeldende plan. Åpne detaljer for full formulering."
      };
  }
}

function bindAdminForms(): void {
  const setFlash = (msg: string) => {
    adminFlash = msg;
  };

  document.getElementById("admin-login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const password = String(fd.get("password") ?? "");
    setFlash("Logger inn…");
    render();
    const err = await loginWithPassword(password);
    setFlash(err ?? "Innlogget. Du kan nå låse og forskyve uker.");
    render();
  });

  document.getElementById("admin-logout")?.addEventListener("click", () => {
    logout();
    render();
  });

  document.getElementById("recipient-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const email = String(fd.get("email") ?? "").trim();
    const name = String(fd.get("name") ?? "").trim() || undefined;
    setFlash(`Legger til ${email}…`);
    render();
    const err = await addRecipientEmail(email, name);
    setFlash(err ? `Kunne ikke legge til: ${err}` : `${email} er lagt til som mottaker.`);
    render();
  });

  const sendUkeInput = document.getElementById("send-uke") as HTMLInputElement | null;
  const sendPreview = document.getElementById("send-uke-preview");
  sendUkeInput?.addEventListener("input", () => {
    const uke = Number(sendUkeInput.value);
    if (sendPreview && Number.isFinite(uke)) {
      sendPreview.textContent = weekSendPreview(uke);
    }
  });

  const customUkeInput = document.getElementById("custom-uke") as HTMLInputElement | null;
  const customPreview = document.getElementById("custom-uke-preview");
  customUkeInput?.addEventListener("input", () => {
    const uke = Number(customUkeInput.value);
    if (!Number.isFinite(uke)) return;
    customizeUke = uke;
    if (customPreview) customPreview.textContent = weekSendPreview(uke);
    const row = (effectiveUker ?? []).find((u) => u.uke === uke);
    const yrkeSelect = document.getElementById("custom-yrke") as HTMLSelectElement | null;
    const gramSelect = document.getElementById("custom-grammatikk") as HTMLSelectElement | null;
    if (yrkeSelect) yrkeSelect.value = row?.overrideYrke ?? "";
    if (gramSelect) gramSelect.value = row?.overrideGrammatikk ?? "";
    const statusEl = document.querySelector("#customize-panel .custom-status");
    if (statusEl) {
      const tilpasset = Boolean(row?.tilpasset);
      statusEl.classList.toggle("is-active", tilpasset);
      statusEl.textContent = tilpasset
        ? `Uke ${uke} er tilpasset. Valgene under viser hva som gjelder nå.`
        : `Uke ${uke} følger grunnplanen. Velg yrke og/eller grammatikk for å tilpasse.`;
    }
  });

  document.getElementById("customize-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const uke = Number(fd.get("uke"));
    const yrkeRaw = String(fd.get("yrke") ?? "");
    const gramRaw = String(fd.get("grammatikk") ?? "");
    const note = String(fd.get("note") ?? "") || undefined;
    const yrke = yrkeRaw === "" ? null : yrkeRaw;
    const grammatikk = gramRaw === "" ? null : gramRaw;
    customizeUke = uke;
    if (yrke === null && grammatikk === null) {
      setFlash(`Nullstiller tilpasning for uke ${uke}…`);
      render();
      const err = await runPlanAction({
        type: "clearWeekOverride",
        uke,
        at: new Date().toISOString()
      });
      setFlash(err ? `Kunne ikke nullstille: ${err}` : `Uke ${uke} bruker kapitlets standard igjen.`);
      render();
      return;
    }
    setFlash(`Lagrer tilpasning for uke ${uke}…`);
    render();
    const err = await runPlanAction({
      type: "overrideWeek",
      uke,
      yrke,
      grammatikk,
      note,
      at: new Date().toISOString()
    });
    const deler = [
      yrke ? `yrke «${yrke}»` : null,
      grammatikk ? `grammatikk «${grammatikk}»` : null
    ]
      .filter(Boolean)
      .join(" og ");
    setFlash(
      err
        ? `Kunne ikke lagre: ${err}`
        : `Lagret: uke ${uke} har nå ${deler}. Se «Tilpassede uker» under og merket «Tilpasset» i Årsplan.`
    );
    render();
  });

  document.getElementById("custom-clear")?.addEventListener("click", async () => {
    const uke = Number((document.getElementById("custom-uke") as HTMLInputElement | null)?.value);
    if (!Number.isFinite(uke)) return;
    customizeUke = uke;
    setFlash(`Nullstiller tilpasning for uke ${uke}…`);
    render();
    const err = await runPlanAction({
      type: "clearWeekOverride",
      uke,
      at: new Date().toISOString()
    });
    setFlash(err ? `Kunne ikke nullstille: ${err}` : `Uke ${uke} er nullstilt og følger grunnplanen igjen.`);
    render();
  });

  app?.querySelectorAll<HTMLButtonElement>(".custom-edit").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uke = Number(btn.dataset.uke);
      if (!Number.isFinite(uke)) return;
      customizeUke = uke;
      render();
      document.getElementById("customize-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  app?.querySelectorAll<HTMLButtonElement>(".custom-reset").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const uke = Number(btn.dataset.uke);
      if (!Number.isFinite(uke)) return;
      if (!window.confirm(`Nullstille tilpasningen for uke ${uke}?`)) return;
      customizeUke = uke;
      setFlash(`Nullstiller tilpasning for uke ${uke}…`);
      render();
      const err = await runPlanAction({
        type: "clearWeekOverride",
        uke,
        at: new Date().toISOString()
      });
      setFlash(err ? `Kunne ikke nullstille: ${err}` : `Uke ${uke} er nullstilt og følger grunnplanen igjen.`);
      render();
    });
  });

  document.getElementById("send-hefte-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const uke = Number(fd.get("uke"));
    const mode = String(fd.get("mode") ?? "one") === "all" ? "all" : "one";
    const motaker = String(fd.get("motaker") ?? "").trim() || undefined;
    if (mode === "one" && !motaker) {
      setFlash("Skriv inn e-postadressen du vil sende til.");
      render();
      return;
    }
    setFlash(`Genererer og sender hefte for uke ${uke}… Dette kan ta 1–2 minutter.`);
    render();
    const result = await sendHefteManualWithMessage({ uke, mode, motaker });
    setFlash(result.error ? `Sending feilet: ${result.error}` : (result.detail ?? "Hefte sendt."));
    render();
  });

  app?.querySelectorAll<HTMLButtonElement>(".recipient-remove").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      if (!email) return;
      if (!window.confirm(`Fjerne ${email} fra mottakerlisten?`)) return;
      setFlash(`Fjerner ${email}…`);
      render();
      const err = await removeRecipientEmail(email);
      setFlash(err ? `Kunne ikke fjerne: ${err}` : `${email} er fjernet.`);
      render();
    });
  });

  document.getElementById("lock-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const uke = Number(fd.get("uke"));
    setFlash(`Låser uke ${uke}…`);
    render();
    const err = await runPlanAction({
      type: "lock",
      uke,
      note: String(fd.get("note") ?? "") || undefined,
      at: new Date().toISOString()
    });
    const locked = (effectiveUker ?? [])
      .filter((u) => u.status === "locked")
      .map((u) => u.uke)
      .join(", ");
    setFlash(
      err
        ? `Kunne ikke låse uke ${uke}: ${err}`
        : `Uke ${uke} er låst på server. Låste uker nå: ${locked || String(uke)}.`
    );
    render();
  });

  document.getElementById("unlock-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const uke = Number(fd.get("uke"));
    setFlash(`Låser opp uke ${uke}…`);
    render();
    const err = await runPlanAction({
      type: "unlock",
      uke,
      at: new Date().toISOString()
    });
    setFlash(err ? `Kunne ikke låse opp: ${err}` : `Uke ${uke} er låst opp.`);
    render();
  });

  document.getElementById("shift-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setFlash("Forskyver…");
    render();
    const err = await runPlanAction({
      type: "shift",
      fromUke: Number(fd.get("fromUke")),
      weeks: Number(fd.get("weeks")),
      note: String(fd.get("note") ?? "") || undefined,
      at: new Date().toISOString()
    });
    setFlash(err ? `Kunne ikke forskyve: ${err}` : "Plan forskjøvet. Se Oversikt.");
    render();
  });

  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.confirm("Tilbakestille hele planen til grunnplanen?")) return;
    setFlash("Tilbakestiller…");
    render();
    const err = await runPlanAction({ type: "reset", at: new Date().toISOString() });
    setFlash(err ? `Kunne ikke tilbakestille: ${err}` : "Tilbakestilt til grunnplan.");
    render();
  });
}

function render(): void {
  if (!app) return;
  const { view, periode } = parseView();
  const copy = pageCopy(view, periode);
  let content = "";
  if (view === "denne-uken") content = renderDenneUken();
  else if (view === "veiledning") content = renderVeiledning();
  else if (view === "om") content = renderOm();
  else if (view === "admin") content = renderAdmin();
  else content = renderOversikt(periode);

  app.innerHTML = renderShell({
    active: view,
    title: copy.title,
    subtitle: copy.subtitle,
    content,
    currentWeekLabel: currentWeekLabel()
  });

  const toggle = document.getElementById("nav-toggle");
  const meny = document.getElementById("hovedmeny");
  toggle?.addEventListener("click", () => {
    const open = meny?.classList.toggle("is-open") ?? false;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  });

  app.querySelectorAll<HTMLDetailsElement>(".uke-card details").forEach((d) => {
    const action = d.querySelector(".uke-action");
    const sync = () => {
      if (action) action.textContent = d.open ? "Lukk detaljer" : "Åpne detaljer";
    };
    sync();
    d.addEventListener("toggle", sync);
  });

  if (view === "admin") {
    bindAdminForms();
    if (isLoggedIn() && !recipientsFetched && !recipientsLoading) {
      void refreshRecipients().then(() => {
        if (parseView().view === "admin") render();
      });
    }
  }
}

window.addEventListener("hashchange", () => {
  render();
});

await refreshPlanFromApi();
render();
