import planJson from "../../data/arsplan-2026-2027.json";
import { getIsoWeekNumber, getIsoWeekYear } from "./isoWeek";
import {
  getLocalEffectiveUker,
  loadLocalPlanState,
  saveLocalPlanState
} from "./localPlan";
import { buildUkeVisninger, escapeHtml, findUke, toArsplanDokument } from "./plan";
import { matteKategoriLabelForKapittel } from "./hverdagsmatematikk";
import { renderMonthCalendarHtml } from "./monthCalendar";
import { computeEffectiveSchedule, setSchoolYearStartWeek, type PlanOperation, type PlanState } from "./schedule";
import type { ArsplanDokument, EffectiveUke, PlanApiResponse, UkeVisning, ViewId } from "./types";
import { renderShell, renderUkeCard } from "./ui";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "https://mbo-automation-b8bi.vercel.app";

const SESSION_KEY = "mbo-admin-session-v1";

/**
 * Vedlikehold: Oppdater DOCS_UPDATED hver gang «Om»-teksten endres,
 * og hold forklaringen i tråd med nye funksjoner i appen.
 */
const DOCS_UPDATED = "4. august 2026";

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
/** Resultat etter «Send hefte» — egen boks i panelet */
type SendHefteUiResult =
  | { kind: "pending"; uke: number }
  | {
      kind: "success";
      uke: number;
      kapittel?: number;
      sentTo: string[];
      note?: string;
      status?: "sent" | "accepted";
    }
  | { kind: "error"; message: string };
let sendHefteResult: SendHefteUiResult | null = null;
/** Uken som er valgt i «Tilpass yrke og grammatikk», overlever re-render */
let customizeUke: number | null = null;
/** Skoleår-status fra API */
let schoolYearInfo: PlanApiResponse["schoolYear"] | null = null;
let schoolYearFlash: string | null = null;
/** Status for ekstraoppgaver-sending på Nå */
let ekstraFlash: string | null = null;
/**
 * Senteruke i ukekort-stripen på Nå (skoleuke-nummer).
 * null = følg inneværende kalenderuke.
 */
let nowStripCenterUke: number | null = null;

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
  const params = new URLSearchParams(query);
  const periode = params.get("m") ?? undefined;
  // Gamle lenker: Perioder → Nå, Veiledning → Om
  if (raw === "perioder") {
    return { view: "denne-uken" };
  }
  if (raw === "veiledning") {
    return { view: "om", periode };
  }
  const view = (raw || "oversikt") as ViewId;
  if (
    view === "skolear" ||
    view === "oversikt" ||
    view === "denne-uken" ||
    view === "om" ||
    view === "admin"
  ) {
    return { view, periode };
  }
  return { view: "denne-uken" };
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
  schoolYearInfo = data.schoolYear ?? null;
  setSchoolYearStartWeek(data.schoolYear?.configured ? data.schoolYear.startWeek : null);
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
    // Skoleår-profil må alltid inn — også uten innlogging — ellers blir ranking/UI stående på uke 34.
    schoolYearInfo = data.schoolYear ?? null;
    setSchoolYearStartWeek(data.schoolYear?.configured ? data.schoolYear.startWeek : null);

    const local = loadLocalPlanState();
    const localHasChanges = local.operations.some((op) => op.type !== "reset");
    const schoolYearActive = Boolean(data.schoolYear?.configured);

    // Når Skoleår er aktivt, er serverens ukefordeling sannheten (ikke lokal omregning mot gammel fasit).
    if (schoolYearActive || (data.effective.hasChanges && !localHasChanges)) {
      effectiveUker = data.effective.uker;
      planSource = data.effective.hasChanges || schoolYearActive ? "server" : "base";
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
    schoolYearInfo = null;
    setSchoolYearStartWeek(null);
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
            ? {
                uke: op.uke,
                note: op.note,
                yrke: op.yrke,
                grammatikk: op.grammatikk,
                tema: op.tema,
                fokus: op.fokus
              }
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
}): Promise<{
  error: string | null;
  uke?: number;
  kapittel?: number;
  sentTo?: string[];
  note?: string;
  status?: "sent" | "accepted";
}> {
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
      contentSource?: string;
      status?: "sent" | "accepted";
    };
    if (res.status === 401) {
      setSessionToken("");
      return { error: "Økten er utløpt. Logg inn på nytt." };
    }
    if (!res.ok || !data.success) {
      return { error: data.error ?? `Sending feilet (${res.status})` };
    }
    const status = data.status === "accepted" ? "accepted" : "sent";
    let note: string | undefined;
    if (status === "accepted") {
      note =
        "Generering pågår i bakgrunnen. Sjekk innboksen om noen minutter (også søppelpost). " +
        "Du trenger ikke vente i denne fanen.";
    } else if (data.contentSource === "fallback") {
      note = "Innholdet ble laget med reservedeløsning (Gemini feilet).";
    }
    return {
      error: null,
      uke: data.uke ?? input.uke,
      kapittel: data.kapittel,
      sentTo: data.sentTo ?? [],
      status,
      note
    };
  } catch {
    return {
      error:
        "Tilkoblingen ble brutt før svar kom — ofte fordi genereringen tok lang tid. " +
        "Sjekk innboksen før du prøver igjen (heftet kan likevel være sendt). Vent gjerne 2–3 minutter."
    };
  }
}

function currentWeekLabel(): string {
  const uke = getIsoWeekNumber();
  const year = getIsoWeekYear();
  const match = findUke(plan, uke, effectiveUker);
  if (match?.status === "locked") {
    return `Skoleuke ${uke} (${year}) · låst`;
  }
  if (match?.kapittel) {
    return `Skoleuke ${uke} (${year}) · Kap. ${match.kapittel.nummer} ${match.kapittel.yrke}`;
  }
  if (match?.status === "empty") {
    return `Skoleuke ${uke} (${year}) · innhenting`;
  }
  return `Skoleuke ${uke} (${year}) · ikke i inneværende skoleårsplan`;
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
        <li><span class="badge badge-tilpasset">Tilpasset</span> tema/yrke/grammatikk</li>
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
        ${changed ? `Grunnplanen er uendret som fasit. ` : ""}${updated ? `Sist endret ${escapeHtml(updated)}. ` : ""}<a href="#/om">Hva betyr dette?</a>
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

function weekStripRoleLabel(
  role: "prev" | "now" | "next",
  u: UkeVisning | undefined,
  todayUke: number
): string {
  if (role === "prev") return "Uken før";
  if (role === "next") return "Uken etter";
  if (u && u.uke === todayUke) return "Denne uken";
  return "Valgt uke";
}

function renderWeekSummaryCard(
  u: UkeVisning | undefined,
  role: "prev" | "now" | "next",
  todayUke: number
): string {
  const roleLabel = weekStripRoleLabel(role, u, todayUke);
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
  const regning = k ? escapeHtml(matteKategoriLabelForKapittel(k.nummer)) : "";
  const kapLine = k ? `Kapittel ${k.nummer} · ${escapeHtml(k.tittel)}` : "";
  const jump = `#/oversikt?m=${encodeURIComponent(u.maned || "")}`;
  const isActualNow = u.uke === todayUke;
  return `
    <article class="week-summary is-${role} ${weekStatusClass(u)}${isActualNow ? " is-actual-now" : ""}">
      <p class="week-role">${roleLabel}${
        isActualNow && role !== "now" ? ` <span class="badge badge-now">I dag</span>` : ""
      }</p>
      <p class="week-num">Uke ${u.uke}<span class="week-maned">${escapeHtml(u.maned || "")}</span></p>
      <h3 class="week-headline">${weekHeadline(u)}</h3>
      ${k ? `<p class="week-gram"><span class="week-gram-label">Grammatikk</span> ${gram}</p>` : ""}
      ${
        k
          ? `<p class="week-gram"><span class="week-gram-label">Regning</span> ${regning} · nivå 1 og 2</p>`
          : ""
      }
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

function weekNavChevron(dir: "prev" | "next"): string {
  const path =
    dir === "prev"
      ? "M14.5 5.5 8 12l6.5 6.5"
      : "M9.5 5.5 16 12l-6.5 6.5";
  return `<svg class="week-nav-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="${path}" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
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
  const shortRaw =
    u.status === "locked"
      ? "Ferie"
      : u.status === "empty"
        ? "Innhenting"
        : u.kapittel
          ? u.kapittel.yrke || u.kapittel.tittel
          : "—";
  const regning =
    u.status === "teaching" && u.kapittel
      ? matteKategoriLabelForKapittel(u.kapittel.nummer)
      : "";
  const title = regning
    ? `Uke ${u.uke}: ${shortRaw} · Regning: ${regning}`
    : `Uke ${u.uke}: ${shortRaw}`;
  return `
    <a
      class="cal-week ${weekStatusClass(u)}${u.erDagensUke ? " is-current" : ""}"
      href="${jump}"
      title="${escapeHtml(title)}"
      ${u.erDagensUke ? 'aria-current="date"' : ""}
    >
      <span class="cal-week-num">Uke ${u.uke}</span>
      <span class="cal-week-yrke">${escapeHtml(shortRaw)}</span>
      ${regning ? `<span class="cal-week-regning">Regning: ${escapeHtml(regning)}</span>` : ""}
      ${u.erDagensUke ? `<span class="cal-week-here">Du er her</span>` : ""}
    </a>
  `;
}

function renderEkstraPanel(uke: number): string {
  const recipientOptions = recipients
    .filter((r) => r.active)
    .map((r) => `<option value="${escapeHtml(r.email)}">${escapeHtml(r.email)}</option>`)
    .join("");

  if (!isLoggedIn()) {
    return `
      <section class="panel ekstra-panel" aria-label="Ekstraoppgaver">
        <h2>Ekstraoppgaver</h2>
        <p class="muted">Logg inn under <a href="#/admin">Admin</a> for å sende ekstraoppgaver som eget Word-dokument på e-post.</p>
      </section>`;
  }

  return `
    <section class="panel ekstra-panel" aria-label="Ekstraoppgaver">
      <h2>Ekstraoppgaver</h2>
      <p class="help-text">
        Lager <strong>egne Word-dokumenter</strong> som tillegg til hovedheftet.
        Sendes <strong>ikke</strong> automatisk — bare når du ber om det.
        Velger du både enklere og vanskeligere, går det som <strong>to separate e-poster</strong>.
      </p>
      ${ekstraFlash ? `<p class="admin-flash" role="status">${escapeHtml(ekstraFlash)}</p>` : ""}
      <form id="ekstra-form" class="admin-form">
        <label for="ekstra-uke">Skoleuke</label>
        <input id="ekstra-uke" name="uke" type="number" min="1" max="53" required value="${uke}" />

        <fieldset class="send-mode">
          <legend>Nivå (kan velge begge)</legend>
          <label class="radio-row"><input type="checkbox" name="niva" value="enklere" checked /> Enklere</label>
          <label class="radio-row"><input type="checkbox" name="niva" value="vanskeligere" /> Vanskeligere</label>
        </fieldset>

        <fieldset class="send-mode">
          <legend>Temaer (én, flere eller alle)</legend>
          <label class="radio-row"><input type="checkbox" name="tema" value="lareverk" checked /> Tema</label>
          <label class="radio-row"><input type="checkbox" name="tema" value="yrke" checked /> Yrke</label>
          <label class="radio-row"><input type="checkbox" name="tema" value="arbeidsnorsk" checked /> Arbeidsnorsk</label>
          <label class="radio-row"><input type="checkbox" name="tema" value="hverdagssituasjon" /> Hverdagssituasjon</label>
          <label class="radio-row"><input type="checkbox" name="tema" value="grammatikk" checked /> Grammatikk</label>
        </fieldset>
        <p class="muted">Grammatikk følger ukas grammatikktema, med forklaring, hensikt, eksempeltekst og oppgaver.</p>

        <fieldset class="send-mode">
          <legend>Mottakere</legend>
          <label class="radio-row">
            <input type="radio" name="mode" value="all" checked /> Alle aktive mottakere
          </label>
          <label class="radio-row">
            <input type="radio" name="mode" value="one" /> Én adresse
          </label>
          <label for="ekstra-motaker" class="sr-only">E-postadresse</label>
          <input id="ekstra-motaker" name="motaker" type="email" list="ekstra-recipient-list" placeholder="navn@example.com" />
          <datalist id="ekstra-recipient-list">${recipientOptions}</datalist>
        </fieldset>

        <button type="submit" class="btn">Send ekstraoppgaver</button>
      </form>
    </section>`;
}

/** Antall ekstra fridag-rader i Skoleår-skjemaet (overlever re-render midlertidig) */
let skolearExtraDayRows = 2;

function renderBreakSummaryHtml(sy: NonNullable<PlanApiResponse["schoolYear"]>): string {
  const summary = sy.breakSummary;
  if (!summary) {
    return `<p class="muted">Låste skoleuker (uten undervisning): ${(sy.holidayWeeks ?? [])
      .map((w) => `uke ${w}`)
      .join(", ") || "ingen"}</p>`;
  }
  const periodItems = summary.periods.length
    ? `<ul class="break-summary-list">${summary.periods
        .map((p) => `<li>${escapeHtml(p.label)}</li>`)
        .join("")}</ul>`
    : `<p class="muted">Ingen ferieperioder lagret.</p>`;
  const dayItems = summary.days.length
    ? `<ul class="break-summary-list">${summary.days
        .map((d) => `<li>${escapeHtml(d.label)}</li>`)
        .join("")}</ul>`
    : `<p class="muted">Ingen ekstra fridager lagret.</p>`;

  return `
    <div class="break-summary">
      <h3 class="break-summary-title">Ferieperioder (uker uten undervisning)</h3>
      ${periodItems}
      <h3 class="break-summary-title">Ekstra fridager (uken fortsetter med undervisning)</h3>
      ${dayItems}
    </div>`;
}

function renderSkolear(): string {
  const sy = schoolYearInfo;
  const savedPeriods =
    sy?.holidays?.filter((h) => (h.kind ?? "period") === "period") ?? [];
  const savedDays = sy?.holidays?.filter((h) => h.kind === "day") ?? [];

  const defaultPeriods = [
    { name: "Høstferie", startDate: "", endDate: "" },
    { name: "Juleferie", startDate: "", endDate: "" },
    { name: "Vinterferie", startDate: "", endDate: "" },
    { name: "Påskeferie", startDate: "", endDate: "" }
  ];
  const periods =
    savedPeriods.length > 0
      ? savedPeriods.map((h) => ({
          name: h.name,
          startDate: h.startDate,
          endDate: h.endDate
        }))
      : defaultPeriods;

  const dayRows =
    savedDays.length > 0
      ? savedDays.map((h) => ({ name: h.name, date: h.startDate }))
      : Array.from({ length: Math.max(skolearExtraDayRows, 2) }, () => ({
          name: "",
          date: ""
        }));

  const status = sy?.configured
    ? `<div class="panel plan-status" role="status">
        <div class="plan-status-head">
          <span class="plan-status-pill">Aktivt skoleår</span>
          <p class="plan-status-lead">${escapeHtml(sy.label || plan.metadata.skolear || "Skoleår")} · starter skoleuke ${sy.startWeek ?? "—"} · ${escapeHtml(sy.startDate ?? "")} – ${escapeHtml(sy.endDate ?? "")}</p>
        </div>
        ${renderBreakSummaryHtml(sy)}
      </div>`
    : `<div class="panel note" role="status">Ingen skoleår-profil er lagret ennå. Fyll inn start, slutt, ferieperioder og eventuelle ekstra fridager, og generer planen.</div>`;

  if (!isLoggedIn()) {
    return `
      ${status}
      <div class="panel">
        <h2>Sett opp skoleåret</h2>
        <p>Logg inn under <a href="#/admin">Admin</a> for å lagre start, slutt og fridager. Deretter genereres årsplanen automatisk.</p>
      </div>`;
  }

  return `
    ${status}
    ${schoolYearFlash ? `<p class="admin-flash" role="status">${escapeHtml(schoolYearFlash)}</p>` : ""}
    <div class="panel">
      <h2>Generer plan for skoleåret</h2>
        <p class="help-text">
        <strong>Ferieperioder</strong> (f.eks. høst- og juleferie) låser hele skoleuker uten undervisning
        når perioden dekker minst tre ukedager.<br/>
        <strong>Ekstra fridager</strong> (kurs, planlegging, 1. mai …) registreres på dato —
        skoleuken fortsetter med undervisning de andre dagene.<br/>
        Planen <strong>starter på skoleuken til startdatoen</strong> og hopper over ferieuker automatisk.
        Ferier styres her — ikke under Admin.
      </p>
      <form id="skolear-form" class="admin-form">
        <label for="sy-label">Navn (valgfritt)</label>
        <input id="sy-label" name="label" type="text" maxlength="200" placeholder="Molde voksenopplæring 2026–2027" value="${escapeHtml(sy?.label ?? "")}" />

        <label for="sy-start">Skoleåret starter</label>
        <input id="sy-start" name="startDate" type="date" required value="${escapeHtml(sy?.startDate ?? "2026-08-17")}" />

        <label for="sy-end">Skoleåret slutter</label>
        <input id="sy-end" name="endDate" type="date" required value="${escapeHtml(sy?.endDate ?? "2027-06-18")}" />

        <h3 class="custom-list-title">Ferieperioder</h3>
        <p class="muted">Hele ferier med fra–til. Tomme rader hoppes over.</p>
        <div id="sy-periods" class="admin-grid">
          ${periods
            .map(
              (h, i) => `
            <div class="admin-form break-card">
              <label for="sy-p-name-${i}">Navn</label>
              <input id="sy-p-name-${i}" name="pName" type="text" value="${escapeHtml(h.name)}" />
              <label for="sy-p-start-${i}">Fra dato</label>
              <input id="sy-p-start-${i}" name="pStart" type="date" value="${escapeHtml(h.startDate)}" />
              <label for="sy-p-end-${i}">Til dato</label>
              <input id="sy-p-end-${i}" name="pEnd" type="date" value="${escapeHtml(h.endDate)}" />
            </div>`
            )
            .join("")}
        </div>
        <button type="button" class="btn btn-ghost" id="sy-add-period">+ Legg til ferieperiode</button>

        <h3 class="custom-list-title">Ekstra fridager</h3>
        <p class="muted">Kursdager, planleggingsdager og andre enkeltdager. Uken låses ikke.</p>
        <div id="sy-days" class="admin-grid">
          ${dayRows
            .map(
              (d, i) => `
            <div class="admin-form break-card">
              <label for="sy-d-name-${i}">Navn</label>
              <input id="sy-d-name-${i}" name="dName" type="text" placeholder="Kursdag / Planlegging" value="${escapeHtml(d.name)}" />
              <label for="sy-d-date-${i}">Dato</label>
              <input id="sy-d-date-${i}" name="dDate" type="date" value="${escapeHtml(d.date)}" />
            </div>`
            )
            .join("")}
        </div>
        <button type="button" class="btn btn-ghost" id="sy-add-day">+ Legg til fridag</button>

        <div class="btn-row">
          <button type="submit" class="btn">Lagre og generer plan</button>
        </div>
      </form>
    </div>
  `;
}

function renderDenneUken(): string {
  const todayUke = getIsoWeekNumber();
  const year = getIsoWeekYear();
  const uker = buildUkeVisninger(plan, effectiveUker);
  const todayIdx = uker.findIndex((u) => u.uke === todayUke);
  const todayMatch = todayIdx >= 0 ? uker[todayIdx] : findUke(plan, todayUke, effectiveUker);

  let centerIdx = todayIdx;
  if (nowStripCenterUke != null) {
    const focused = uker.findIndex((u) => u.uke === nowStripCenterUke);
    if (focused >= 0) centerIdx = focused;
    else nowStripCenterUke = null;
  }
  if (centerIdx < 0 && uker.length) {
    centerIdx = 0;
    nowStripCenterUke = uker[0]!.uke;
  }

  const center = centerIdx >= 0 ? uker[centerIdx] : todayMatch;
  const prevUke = centerIdx > 0 ? uker[centerIdx - 1] : undefined;
  const nextUke = centerIdx >= 0 && centerIdx < uker.length - 1 ? uker[centerIdx + 1] : undefined;
  const canPrev = centerIdx > 0;
  const canNext = centerIdx >= 0 && centerIdx < uker.length - 1;
  const browsingAway = center != null && center.uke !== todayUke;

  const outsidePlan = todayIdx < 0 && !todayMatch && !uker.length;
  const hero = `
    <div class="panel highlight now-hero">
      <p class="now-kicker">Der vi er nå</p>
      <p class="now-week">Skoleuke ${todayUke} <span class="now-year">· ${year}</span></p>
      <p class="lede">${
        outsidePlan
          ? `Uke ${todayUke} er utenfor skoleåret ${escapeHtml(plan.metadata.skolear ?? "")}. Se hele årsplanen nedenfor.`
          : "Bla mellom ukene med pilene — tre uker vises om gangen. Under ser du detaljer for den valgte uken."
      }</p>
    </div>`;

  const status = renderPlanStatus();
  const skolearHint = schoolYearInfo?.configured
    ? ""
    : `<div class="panel note" role="status">Skoleåret er ikke satt opp ennå. Gå til <a href="#/skolear">Skoleår</a> og definer start, slutt og ferier — ellers følger planen den gamle fasiten fra uke 34.</div>`;

  const strip = outsidePlan || centerIdx < 0
    ? ""
    : `
    <section class="week-strip-section" aria-label="Bla mellom skoleuker">
      <div class="week-strip-toolbar">
        <p class="week-strip-hint muted">Viser uke ${prevUke?.uke ?? "—"} · <strong>${center?.uke ?? "—"}</strong> · ${nextUke?.uke ?? "—"}</p>
        ${
          browsingAway
            ? `<button type="button" class="btn btn-ghost week-strip-today" id="week-strip-today">Tilbake til denne uken</button>`
            : ""
        }
      </div>
      <div class="week-strip-wrap">
        <button type="button" class="week-nav week-nav-prev" id="week-strip-prev"
          aria-label="Bla én uke tilbake" ${canPrev ? "" : "disabled"}>
          ${weekNavChevron("prev")}
          <span class="week-nav-label">Tilbake</span>
        </button>
        <div class="week-strip" aria-live="polite">
          ${renderWeekSummaryCard(prevUke, "prev", todayUke)}
          ${renderWeekSummaryCard(center, "now", todayUke)}
          ${renderWeekSummaryCard(nextUke, "next", todayUke)}
        </div>
        <button type="button" class="week-nav week-nav-next" id="week-strip-next"
          aria-label="Bla én uke frem" ${canNext ? "" : "disabled"}>
          <span class="week-nav-label">Frem</span>
          ${weekNavChevron("next")}
        </button>
      </div>
    </section>`;

  const detail = center ? `<section class="now-detail">${renderUkeCard(center, true)}</section>` : "";
  const ekstra = renderEkstraPanel(center?.uke ?? todayUke);

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

  return `
    <div class="now-layout">
      ${renderMonthCalendarHtml(escapeHtml)}
      <div class="now-main">
        ${hero}${skolearHint}${status}${strip}${detail}${ekstra}${calendar}
      </div>
    </div>`;
}

function renderOm(): string {
  const m = plan.metadata;
  const niva = m.norskniva?.length ? m.norskniva.join(", ") : "—";
  return `
    <div class="panel prose help-box">
      <h2>Hva dette programmet er</h2>
      <p>
        Dette er planleggings- og publiseringsverktøyet for
        <strong>${escapeHtml(m.kurs ?? "Arbeid og norsk")}</strong> ved
        ${escapeHtml(m.organisasjon ?? "Molde voksenopplæring")}.
        Målet er enkelt: du skal alltid vite <em>hva klassen jobber med denne uken</em>,
        kunne justere planen når livet griper inn, og få et ferdig arbeidshefte
        (norsk + hverdagsmatematikk) som Word-fil på e-post — uten å lage alt fra scratch hver uke.
      </p>
      <p>
        Du trenger ikke være innlogget for å <em>se</em> planen.
        For å <em>endre</em> noe (skolerute, forskyvning, tilpasning, sending) logger du inn under
        <a href="#/admin">Admin</a>.
      </p>
      <p class="muted">På denne siden:</p>
      <ol class="help-steps">
        <li>Hvordan programmet er bygget opp</li>
        <li>Komme i gang</li>
        <li>Slik bruker du funksjonene</li>
        <li>Merker og farger</li>
        <li>Hvordan systemet er satt sammen (inkl. Google KI)</li>
      </ol>
    </div>

    <div class="panel prose">
      <h2>1. Hvordan programmet er bygget opp</h2>

      <h3>Fanene i menyen</h3>
      <div class="help-text">
        <p><strong>Skoleår</strong> — start, slutt og ferier for stedet ditt. Her genereres planen første gang.</p>
        <p><strong>Nå</strong> — hvor klassen er: månedskalender, tre ukekort du kan bla i med piler, årskalender, og ekstraoppgaver ved behov.</p>
        <p><strong>Årsplan</strong> — hele året uke for uke: kapittel, yrke, grammatikk, regning (hovedkategori), tematekster og oppgaver.</p>
        <p><strong>Admin</strong> — innlogging, tilpasninger underveis, mottakere og manuell sending.</p>
        <p><strong>Om</strong> — denne siden: oppsett, virkemåte og bruksanvisning.</p>
      </div>

      <h3>Grunnplan og gjeldende plan</h3>
      <dl class="meta-grid">
        <div>
          <dt>Grunnplan</dt>
          <dd>Den opprinnelige årsplanen (uke for uke). «Fasiten» — den endres ikke når du tilpasser.</dd>
        </div>
        <div>
          <dt>Gjeldende plan</dt>
          <dd>Det som gjelder nå: etter ferielås, forskyvning eller tilpasning av enkeltuker.</dd>
        </div>
      </dl>
      <div class="help-text">
        <p><strong>Hvordan ser du hvilken plan du ser?</strong> Øverst på Nå og Årsplan står en markør:</p>
        <p>• <span class="plan-status-pill">Grunnplan</span> — ingenting er endret ennå.</p>
        <p>• <span class="plan-status-pill" style="background:var(--amber);color:#fff;border-color:var(--amber)">Gjeldende plan</span> — planen er tilpasset; markøren viser antall låste, endrede, tilpassede eller innhentingsuker.</p>
        <p class="muted">Du kan alltid tilbakestille tilpasninger til grunnplanen (Admin). Deretter må du evt. generere Skoleår på nytt for å låse ferieuker igjen.</p>
      </div>

      <h3>Ukeheftet — hva elevene får</h3>
      <p>
        Hver onsdag (og når du sender manuelt) lager systemet et Word-hefte for ukas kapittel:
      </p>
      <ul>
        <li><strong>Norsk:</strong> tekster, grammatikkforklaring, oppgaver, ordliste og kapitteltest</li>
        <li><strong>Hverdagsmatematikk:</strong> én fagtekst (80–150 ord) knyttet til ukas yrke/tema,
          deretter 6–7 oppgaver på nivå 1 og 6–7 på nivå 2. Hovedkategori roterer mellom
          Tall, Måling og geometri, og Statistikk.</li>
        <li><strong>Fasit</strong> for norsk og regning ligger bakerst i samme dokument.</li>
      </ul>
      <p>
        Innholdet genereres med KI (Google Gemini) etter årsplanens mal — samme design hver uke.
      </p>

      <h3>Denne kursplanen</h3>
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
      <h2>2. Komme i gang</h2>
      <p>Følg stegene i denne rekkefølgen første gang du bruker programmet:</p>
      <ol class="help-steps">
        <li>
          <strong>Sett opp skoleåret</strong> under <a href="#/skolear">Skoleår</a>:
          startdato, sluttdato, ferieperioder (uker uten undervisning) og eventuelt ekstra fridager
          (kurs/planlegging — uken fortsetter). Trykk «Lagre og generer plan».
          Planen starter på skoleuken til startdatoen din og hopper over ferieuker.
        </li>
        <li>
          <strong>Logg inn</strong> under <a href="#/admin">Admin</a> med admin-passordet.
          Økten huskes i nettleseren i inntil 30 dager.
        </li>
        <li>
          <strong>Sjekk mottakere</strong> i Admin — legg til e-postene som skal få onsdagsheftet.
        </li>
        <li>
          <strong>Se hvor dere er</strong> under <a href="#/denne-uken">Nå</a>,
          eller bla hele året under <a href="#/oversikt">Årsplan</a>.
        </li>
      </ol>
      <p class="muted">Vi snakker om <em>skoleuke</em> (f.eks. skoleuke 32), ikke «ISO-uke».</p>
    </div>

    <div class="panel prose">
      <h2>3. Slik bruker du funksjonene</h2>

      <h3>Skolerute og ferie</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Ved skolestart, og når skoleruta endrer seg.</p>
        <p><strong>Hvordan?</strong> Større endringer: <a href="#/skolear">Skoleår</a> → lagre og generer på nytt.
          Enkeltuker midt i året: Admin → Lås uke / Lås opp uke.</p>
        <p><strong>Hva skjer?</strong> Låste uker får merket <span class="badge badge-lock">Låst</span> — ingen undervisning og ingen hefte.</p>
      </div>

      <h3>Forskyv planen</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Klassen ble ikke ferdig og trenger mer tid på et emne.</p>
        <p><strong>Hvordan?</strong> Admin → Forskyv plan: velg fra-skoleuke og antall uker.</p>
        <p><strong>Hva skjer?</strong> Kapitlene skyves frem. De første ukene blir
          <span class="badge badge-empty">Innhenting</span>. Ferieuker hoppes over.</p>
      </div>

      <h3>Tilpass en uke</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Du vil bytte yrke/grammatikk, eller legge inn et manuelt tema
          (spesiell hendelse, glemt emne).</p>
        <p><strong>Hvordan?</strong> Admin → Tilpass uke: velg uke, fyll inn tema/fokus og evt. yrke/grammatikk, lagre.</p>
        <p><strong>Hva skjer?</strong> Uken merkes <span class="badge badge-tilpasset">Tilpasset</span>.
          Oversikt og hefte bruker dine valg — samme Word-mal.</p>
      </div>

      <h3>Send hefte manuelt</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Du vil forberede deg før den faste onsdagsutsendingen.</p>
        <p><strong>Hvordan?</strong> Admin → Send hefte: velg skoleuke og mottaker(e), trykk Send.
          Det kan ta noen minutter.</p>
        <p><strong>Etter sending:</strong> Du får bekreftelse med liste over e-postadresser.
          Sjekk innboksen (og søppelpost) innen kort tid. Onsdagsjobben fortsetter som normalt.</p>
      </div>

      <h3>Ekstraoppgaver</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Noen elever trenger enklere eller vanskeligere trening.</p>
        <p><strong>Hvordan?</strong> På <a href="#/denne-uken">Nå</a>: huk av nivå og temaer, velg mottakere, send.</p>
        <p><strong>Hva skjer?</strong> Hvert nivå blir eget Word-dokument og egen e-post.
          Sendes <em>aldri</em> automatisk. Samme designmal som hovedheftet.</p>
      </div>

      <h3>E-postmottakere</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Flere skal motta heftet, eller noen skal fjernes.</p>
        <p><strong>Hvordan?</strong> Admin → mottakerlisten: legg til navn og e-post.
          Aktive adresser får onsdagsheftet; hver e-post har egen avmeldingslenke.</p>
      </div>

      <h3>Tilbakestill tilpasninger</h3>
      <div class="help-text">
        <p><strong>Når?</strong> Bare hvis du vil fjerne alle lås, forskyvninger og uketilpasninger.</p>
        <p><strong>Obs:</strong> Kan ikke angres. Kjør «Lagre og generer plan» under Skoleår på nytt
          hvis ferieuker skal låses igjen.</p>
      </div>
    </div>

    <div class="panel prose help-box">
      <h2>4. Merker og farger</h2>
      <ul class="legend-list">
        <li><span class="badge badge-now">Denne uken</span> — inneværende skoleuke</li>
        <li><span class="badge badge-lock">Låst</span> — ferie / ingen undervisning</li>
        <li><span class="badge badge-tilpasset">Tilpasset</span> — tema, yrke eller grammatikk er endret</li>
        <li><span class="badge badge-empty">Innhenting</span> — ekstra tid etter forskyvning</li>
        <li><span class="badge badge-changed">Endret</span> — kapittelet er flyttet fra grunnplanen</li>
      </ul>
      <p>De samme fargene brukes i kalenderen under <a href="#/denne-uken">Nå</a>.</p>
      <p class="after-link"><a class="btn" href="#/skolear">Start med Skoleår</a>
        <a class="btn btn-ghost" href="#/admin">Gå til Admin</a></p>
    </div>

    <div class="panel prose">
      <h2>5. Hvordan systemet er satt sammen</h2>
      <p>
        Tenk på programmet som tre lag som samarbeider — omtrent som planbok, kopimaskin og postgang:
      </p>
      <ol>
        <li>
          <strong>Årsplanen (grunnlaget)</strong> — kapittel, yrke, grammatikk, tematekster og
          hverdagsmatematikk-kategori ligger lagret som strukturert plan. Det er «malen» læreren og
          systemet følger. Det du ser under Årsplan og Nå, kommer herfra (pluss eventuelle tilpasninger).
        </li>
        <li>
          <strong>KI som lager ukeinnholdet</strong> — når heftet skal lages (onsdag eller manuelt),
          sendes ukas kapittel til Google sin språkmodell
          <strong>Gemini 2.5 Flash</strong> (modell-id: <code>gemini-2.5-flash</code>, via Vertex AI).
          Det er denne modellen som genererer tekstene og oppgavene i heftet — både norskdelen og
          hverdagsmatematikk (fagtekst + nivå 1 og 2) — ut fra årsplan-malen, på språk tilpasset
          voksne A2–B1. Resultatet pakkes i samme Word-design hver uke. Hvis KI midlertidig feiler,
          brukes en reservedeløsning slik at utsendingen ikke stopper helt.
        </li>
        <li>
          <strong>Utsending</strong> — Word-filen sendes på e-post til aktive mottakere.
          Det skjer automatisk hver onsdag, og når du trykker «Send hefte» i Admin.
        </li>
      </ol>
      <p>
        <strong>Nettsiden</strong> du bruker nå, er den lette overflaten (publisert via GitHub Pages).
        <strong>Motoren</strong> bak — planlagring, Gemini 2.5 Flash, Word og e-post — kjører som et API
        (Vercel) med planlagt onsdagsjobb. Data lagres i database (Turso).
        Passord og API-nøkler ligger som hemmeligheter på serveren og vises aldri i nettleseren.
      </p>
      <p>
        Pedagogisk poeng: læreren styrer <em>hva</em> som skal jobbes med (planen og tilpasningene);
        Gemini 2.5 Flash hjelper med å <em>formulere</em> tekster og oppgaver innenfor den rammen —
        ikke å erstatte din faglige vurdering.
      </p>
      <p class="muted">Sist oppdatert ${escapeHtml(DOCS_UPDATED)}.</p>
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
  const tema = row.overrideTema ?? kap.arbeidsnorskTema;
  const regning = matteKategoriLabelForKapittel(kap.nummer);
  const tip = row.tilpasset ? " · tilpasset" : "";
  return `Kap. ${kap.nummer} — ${yrke} · ${gram} · Regning: ${regning} (nivå 1 og 2)${
    tema ? ` · Tema: ${tema}` : ""
  }${tip}`;
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
      const tema = u.overrideTema
        ? `<span class="custom-field"><span class="custom-field-label">Tema</span> ${escapeHtml(u.overrideTema)}</span>`
        : "";
      const fokus = u.overrideFokus
        ? `<span class="custom-field"><span class="custom-field-label">Fokus</span> ${escapeHtml(u.overrideFokus)}</span>`
        : "";
      const yrke = u.overrideYrke
        ? `<span class="custom-field"><span class="custom-field-label">Yrke</span> ${escapeHtml(u.overrideYrke)}</span>`
        : "";
      const gram = u.overrideGrammatikk
        ? `<span class="custom-field"><span class="custom-field-label">Grammatikk</span> ${escapeHtml(u.overrideGrammatikk)}</span>`
        : "";
      const baseHint = baseKap
        ? `<span class="muted custom-base">Grunnplan: ${escapeHtml(baseKap.yrke)} · ${escapeHtml(baseKap.grammatikk)}${
            baseKap.arbeidsnorskTema ? ` · ${escapeHtml(baseKap.arbeidsnorskTema)}` : ""
          }</span>`
        : "";
      return `<li>
        <div class="custom-item-main">
          <strong>Uke ${u.uke}</strong> <span class="badge badge-tilpasset">Tilpasset</span>
          <div class="custom-fields">${tema}${fokus}${yrke}${gram}</div>
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
  const selectedTema = row?.overrideTema ?? "";
  const selectedFokus = row?.overrideFokus ?? "";
  const isTilpasset = Boolean(row?.tilpasset);

  const yrkeOpts = catalogOptions("yrke")
    .map((y) => `<option value="${escapeHtml(y)}"></option>`)
    .join("");
  const gramOpts = catalogOptions("grammatikk")
    .map((g) => `<option value="${escapeHtml(g)}"></option>`)
    .join("");

  const statusLine = isTilpasset
    ? `<p class="custom-status is-active" role="status">Uke ${selectedUke} er tilpasset. Feltene under viser hva som gjelder nå.</p>`
    : `<p class="custom-status" role="status">Uke ${selectedUke} følger grunnplanen. Tilpass yrke/grammatikk, eller skriv inn et manuelt tema.</p>`;

  return `
    <div class="panel highlight" id="customize-panel">
      <h2>Tilpass uke</h2>
      <p class="lede">
        Bytt yrke eller grammatikk, eller skriv inn et manuelt tema (spesiell hendelse, glemt emne).
        Heftet bruker samme Word-mal — du styrer innholdet.
      </p>
      <form id="customize-form" class="admin-form send-hefte-form">
        <label for="custom-uke">Velg uke å tilpasse</label>
        <input id="custom-uke" name="uke" type="number" min="1" max="53" required value="${selectedUke}" />
        <p class="muted" id="custom-uke-preview">${escapeHtml(weekSendPreview(selectedUke))}</p>
        ${statusLine}

        <label for="custom-tema">Manuelt tema (arbeidsnorsk)</label>
        <input id="custom-tema" name="tema" type="text" maxlength="500"
          value="${escapeHtml(selectedTema)}"
          placeholder="${baseKap?.arbeidsnorskTema ? `Standard: ${escapeHtml(baseKap.arbeidsnorskTema)}` : "F.eks. Brannøvelse på arbeidsplassen"}" />

        <label for="custom-fokus">Periodenfokus (valgfritt)</label>
        <input id="custom-fokus" name="fokus" type="text" maxlength="500"
          value="${escapeHtml(selectedFokus)}"
          placeholder="Kort begrunnelse eller fokus for uken" />

        <label for="custom-yrke">Yrke</label>
        <input id="custom-yrke" name="yrke" type="text" list="custom-yrke-list" maxlength="200"
          value="${escapeHtml(selectedYrke)}"
          placeholder="${baseKap ? `Standard: ${escapeHtml(baseKap.yrke)}` : "La stå tom for kapitlets standard"}" />
        <datalist id="custom-yrke-list">${yrkeOpts}</datalist>

        <label for="custom-grammatikk">Grammatikk</label>
        <input id="custom-grammatikk" name="grammatikk" type="text" list="custom-gram-list" maxlength="200"
          value="${escapeHtml(selectedGram)}"
          placeholder="${baseKap ? `Standard: ${escapeHtml(baseKap.grammatikk)}` : "La stå tom for kapitlets standard"}" />
        <datalist id="custom-gram-list">${gramOpts}</datalist>

        <label for="custom-note">Notat (valgfritt)</label>
        <input id="custom-note" name="note" type="text" maxlength="300" placeholder="F.eks. Spesiell hendelse i klassen" />

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

function recipientDisplay(email: string): { email: string; name?: string } {
  const row = recipients.find((r) => r.email.toLowerCase() === email.toLowerCase());
  return { email, name: row?.name };
}

function renderSendHefteResult(): string {
  if (!sendHefteResult) return "";

  if (sendHefteResult.kind === "pending") {
    return `
      <div class="send-result send-result-pending" role="status" aria-live="polite">
        <p class="send-result-kicker">Sender…</p>
        <h3 class="send-result-title">Genererer hefte for skoleuke ${sendHefteResult.uke}</h3>
        <p class="send-result-lead">Dette kan ta noen minutter. Vent til bekreftelsen kommer.</p>
      </div>`;
  }

  if (sendHefteResult.kind === "error") {
    return `
      <div class="send-result send-result-error" role="alert">
        <p class="send-result-kicker">Sending feilet</p>
        <h3 class="send-result-title">Heftet ble ikke sendt</h3>
        <p class="send-result-lead">${escapeHtml(sendHefteResult.message)}</p>
      </div>`;
  }

  const { uke, kapittel, sentTo, note, status } = sendHefteResult;
  const accepted = status === "accepted";
  const items = sentTo
    .map((email) => {
      const { name } = recipientDisplay(email);
      return `<li>
        <span class="send-recipient-email">${escapeHtml(email)}</span>
        ${name ? `<span class="send-recipient-name">${escapeHtml(name)}</span>` : ""}
      </li>`;
    })
    .join("");

  const kapLine =
    kapittel != null ? ` · kapittel ${kapittel}` : "";

  return `
    <div class="send-result send-result-success" role="status" aria-live="polite" id="send-hefte-result">
      <p class="send-result-kicker">${accepted ? "Startet" : "Sendt"}</p>
      <h3 class="send-result-title">${accepted ? "Generering er startet" : "Heftet er sendt"}</h3>
      <p class="send-result-lead">
        ${
          accepted
            ? "Serveren lager heftet nå. Du mottar det på e-post når det er ferdig (ofte 1–3 minutter). Sjekk også søppelpost."
            : "Du mottar arbeidsheftet på e-post innen kort tid (sjekk også søppelpost hvis det drøyer)."
        }
      </p>
      <p class="send-result-meta">Skoleuke ${uke}${kapLine}</p>
      ${note ? `<p class="send-result-note">${escapeHtml(note)}</p>` : ""}
      <div class="send-recipients">
        <h4 class="send-recipients-title">Mottakere (${sentTo.length})</h4>
        <ul class="send-recipients-list">
          ${items || "<li class=\"muted\">Ingen adresser i svaret</li>"}
        </ul>
      </div>
    </div>`;
}

function renderSendHeftePanel(): string {
  const ukeNow = getIsoWeekNumber();
  const formUke =
    sendHefteResult && "uke" in sendHefteResult && sendHefteResult.uke != null
      ? sendHefteResult.uke
      : ukeNow;
  const defaultEmail = escapeHtml(defaultSendEmail());
  const busy = sendHefteResult?.kind === "pending";
  return `
    <div class="panel highlight" id="send-hefte-panel">
      <h2>Send hefte nå</h2>
      <p class="lede">
        Generer og send arbeidsheftet for en valgt uke — f.eks. for å forberede deg i forkant.
        Den automatiske onsdagsutsendingen fortsetter som før.
      </p>
      ${renderSendHefteResult()}
      <form id="send-hefte-form" class="admin-form send-hefte-form">
        <label for="send-uke">Skoleuke</label>
        <input id="send-uke" name="uke" type="number" min="1" max="53" required value="${formUke}" ${busy ? "disabled" : ""} />
        <p class="muted" id="send-uke-preview">${escapeHtml(weekSendPreview(formUke))}</p>

        <fieldset class="send-mode" ${busy ? "disabled" : ""}>
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

        <button type="submit" class="btn" ${busy ? "disabled" : ""}>${busy ? "Sender…" : "Send hefte"}</button>
        <p class="muted">Kan ta noen minutter (Gemini lager innhold + Word-fil).</p>
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
    `;
  }

  const syConfigured = Boolean(schoolYearInfo?.configured);

  return `
    <div class="panel prose help-box">
      <h2>Admin — tilpasninger underveis</h2>
      <p>
        Du er innlogget. <strong>Skolerute og ferier</strong> settes under
        <a href="#/skolear">Skoleår</a>. Her justerer du <em>underveis</em>: manuelt tema,
        yrke/grammatikk, forskyvning, lås/lås opp enkeltuker, mottakere og manuell sending.
      </p>
      <p class="muted">
        ${apiStateUpdatedAt ? `Sist oppdatert på server: ${escapeHtml(apiStateUpdatedAt)}. ` : ""}
        <button type="button" class="btn btn-ghost" id="admin-logout">Logg ut</button>
      </p>
    </div>

    ${
      syConfigured
        ? `<div class="panel plan-status" role="status">
            <div class="plan-status-head">
              <span class="plan-status-pill">Skolerute aktiv</span>
              <p class="plan-status-lead">Starter skoleuke ${schoolYearInfo?.startWeek ?? "—"} · ${escapeHtml(schoolYearInfo?.startDate ?? "")} – ${escapeHtml(schoolYearInfo?.endDate ?? "")}</p>
            </div>
            <p class="plan-status-help"><a href="#/skolear">Endre skolerute og ferier under Skoleår</a></p>
          </div>`
        : `<div class="panel note" role="status">
            <p><strong>Skoleår er ikke satt opp ennå.</strong> Gå til
            <a href="#/skolear">Skoleår</a> og lagre start, slutt og ferier — ellers følger oversikten den gamle fasiten fra uke 34.</p>
          </div>`
    }

    ${adminFlash ? `<p class="admin-flash" role="status">${escapeHtml(adminFlash)}</p>` : ""}

    ${renderCustomizePanel()}

    ${renderSendHeftePanel()}

    ${renderRecipientsPanel()}

    <div class="admin-grid">
      <form id="shift-form" class="panel admin-form">
        <h2>Forskyv plan</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Dere trenger mer tid på et emne midt i året.</p>
          <p><strong>Hva skjer?</strong> Kapitler fra valgt skoleuke skyves frem. Første uker blir <em>Innhenting</em>. Ferieuker fra Skoleår hoppes over.</p>
        </div>
        <label for="shift-from">Fra skoleuke</label>
        <input id="shift-from" name="fromUke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="shift-weeks">Hvor mange uker skal planen skyves frem?</label>
        <input id="shift-weeks" name="weeks" type="number" min="1" max="20" required value="1" />
        <label for="shift-note">Notat (valgfritt)</label>
        <input id="shift-note" name="note" type="text" maxlength="300" placeholder="F.eks. Trenger mer tid på grammatikk" />
        <button type="submit" class="btn">Forskyv</button>
      </form>

      <form id="lock-form" class="panel admin-form">
        <h2>Lås uke</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Ekstra fridag, kursuke eller ferie som ikke sto i Skoleår.</p>
          <p><strong>Hva skjer?</strong> Uken merkes <em>Låst</em> — ingen undervisning og ingen hefte.</p>
        </div>
        <label for="lock-uke">Skoleuke</label>
        <input id="lock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="lock-note">Notat (valgfritt)</label>
        <input id="lock-note" name="note" type="text" maxlength="300" placeholder="F.eks. Planleggingsdag" />
        <button type="submit" class="btn">Lås uke</button>
      </form>

      <form id="unlock-form" class="panel admin-form">
        <h2>Lås opp uke</h2>
        <div class="help-text">
          <p><strong>Når?</strong> En låst uke skal likevel ha undervisning.</p>
          <p><strong>Hva skjer?</strong> Låsen fjernes. Kapittelet kommer tilbake (evt. etter forskyvning).</p>
        </div>
        <label for="unlock-uke">Skoleuke</label>
        <input id="unlock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <button type="submit" class="btn">Lås opp</button>
      </form>

      <form id="reset-form" class="panel admin-form">
        <h2>Tilbakestill tilpasninger</h2>
        <div class="help-text">
          <p><strong>Når?</strong> Hvis du vil fjerne forskyvninger, lås og tilpasninger.</p>
          <p><strong>Obs:</strong> Skoleruta (start/slutt/ferier) endres ikke her — bruk <a href="#/skolear">Skoleår</a>. Kan ikke angres.</p>
        </div>
        <button type="submit" class="btn btn-danger">Tilbakestill tilpasninger</button>
      </form>
    </div>
  `;
}

function pageCopy(view: ViewId, periode?: string): { title: string; subtitle: string } {
  switch (view) {
    case "skolear":
      return {
        title: "Skoleår",
        subtitle: "Sett start, slutt og ferier — så genereres planen for undervisningsukene."
      };
    case "denne-uken":
      return {
        title: "Nå",
        subtitle: "Bla mellom ukene, se detaljer og kalender — og send ekstraoppgaver ved behov."
      };
    case "om":
      return {
        title: "Om programmet",
        subtitle:
          "Her får du en pedagogisk innføring: hvordan årsplan, ukehefte og KI-henger sammen — og hvordan du bruker verktøyet i praksis."
      };
    case "admin":
      return {
        title: "Admin — tilpasninger",
        subtitle: isLoggedIn()
          ? "Manuelt tema, yrke/grammatikk, forskyv, lås/lås opp, mottakere og sending. Skolerute under Skoleår."
          : "Logg inn med admin-passord for å gjøre tilpasninger."
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
    const yrkeInput = document.getElementById("custom-yrke") as HTMLInputElement | null;
    const gramInput = document.getElementById("custom-grammatikk") as HTMLInputElement | null;
    const temaInput = document.getElementById("custom-tema") as HTMLInputElement | null;
    const fokusInput = document.getElementById("custom-fokus") as HTMLInputElement | null;
    if (yrkeInput) yrkeInput.value = row?.overrideYrke ?? "";
    if (gramInput) gramInput.value = row?.overrideGrammatikk ?? "";
    if (temaInput) temaInput.value = row?.overrideTema ?? "";
    if (fokusInput) fokusInput.value = row?.overrideFokus ?? "";
    const statusEl = document.querySelector("#customize-panel .custom-status");
    if (statusEl) {
      const tilpasset = Boolean(row?.tilpasset);
      statusEl.classList.toggle("is-active", tilpasset);
      statusEl.textContent = tilpasset
        ? `Uke ${uke} er tilpasset. Feltene under viser hva som gjelder nå.`
        : `Uke ${uke} følger grunnplanen. Tilpass yrke/grammatikk, eller skriv inn et manuelt tema.`;
    }
  });

  document.getElementById("customize-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    const uke = Number(fd.get("uke"));
    const yrkeRaw = String(fd.get("yrke") ?? "").trim();
    const gramRaw = String(fd.get("grammatikk") ?? "").trim();
    const temaRaw = String(fd.get("tema") ?? "").trim();
    const fokusRaw = String(fd.get("fokus") ?? "").trim();
    const note = String(fd.get("note") ?? "") || undefined;
    const yrke = yrkeRaw === "" ? null : yrkeRaw;
    const grammatikk = gramRaw === "" ? null : gramRaw;
    const tema = temaRaw === "" ? null : temaRaw;
    const fokus = fokusRaw === "" ? null : fokusRaw;
    customizeUke = uke;
    if (yrke === null && grammatikk === null && tema === null && fokus === null) {
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
      tema,
      fokus,
      note,
      at: new Date().toISOString()
    });
    const deler = [
      tema ? `tema «${tema}»` : null,
      fokus ? `fokus «${fokus}»` : null,
      yrke ? `yrke «${yrke}»` : null,
      grammatikk ? `grammatikk «${grammatikk}»` : null
    ]
      .filter(Boolean)
      .join(", ");
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
      sendHefteResult = { kind: "error", message: "Skriv inn e-postadressen du vil sende til." };
      render();
      document.getElementById("send-hefte-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    sendHefteResult = { kind: "pending", uke };
    render();
    document.getElementById("send-hefte-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    const result = await sendHefteManualWithMessage({ uke, mode, motaker });
    if (result.error) {
      sendHefteResult = { kind: "error", message: result.error };
    } else {
      sendHefteResult = {
        kind: "success",
        uke: result.uke ?? uke,
        kapittel: result.kapittel,
        sentTo: result.sentTo ?? (motaker ? [motaker] : []),
        note: result.note,
        status: result.status
      };
    }
    render();
    document.getElementById("send-hefte-result")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    setFlash(err ? `Kunne ikke forskyve: ${err}` : "Plan forskjøvet. Se Årsplan.");
    render();
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
    setFlash(err ? `Kunne ikke låse: ${err}` : `Uke ${uke} er låst.`);
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

  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.confirm("Tilbakestille forskyvninger, lås og tilpasninger? Skoleruta under Skoleår beholdes.")) return;
    setFlash("Tilbakestiller…");
    render();
    const err = await runPlanAction({ type: "reset", at: new Date().toISOString() });
    setFlash(err ? `Kunne ikke tilbakestille: ${err}` : "Tilpasninger tilbakestilt. Kjør «Lagre og generer plan» under Skoleår på nytt hvis ferieuker skal låses igjen.");
    render();
  });
}

function bindSkolearForm(): void {
  document.getElementById("sy-add-period")?.addEventListener("click", () => {
    const grid = document.getElementById("sy-periods");
    if (!grid) return;
    const i = grid.querySelectorAll(".break-card").length;
    const wrap = document.createElement("div");
    wrap.className = "admin-form break-card";
    wrap.innerHTML = `
      <label for="sy-p-name-${i}">Navn</label>
      <input id="sy-p-name-${i}" name="pName" type="text" placeholder="Ferieperiode" />
      <label for="sy-p-start-${i}">Fra dato</label>
      <input id="sy-p-start-${i}" name="pStart" type="date" />
      <label for="sy-p-end-${i}">Til dato</label>
      <input id="sy-p-end-${i}" name="pEnd" type="date" />`;
    grid.appendChild(wrap);
  });

  document.getElementById("sy-add-day")?.addEventListener("click", () => {
    const grid = document.getElementById("sy-days");
    if (!grid) return;
    const i = grid.querySelectorAll(".break-card").length;
    skolearExtraDayRows = i + 1;
    const wrap = document.createElement("div");
    wrap.className = "admin-form break-card";
    wrap.innerHTML = `
      <label for="sy-d-name-${i}">Navn</label>
      <input id="sy-d-name-${i}" name="dName" type="text" placeholder="Kursdag / Planlegging" />
      <label for="sy-d-date-${i}">Dato</label>
      <input id="sy-d-date-${i}" name="dDate" type="date" />`;
    grid.appendChild(wrap);
  });

  document.getElementById("skolear-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);

    const holidays: Array<{
      name: string;
      startDate: string;
      endDate: string;
      kind: "period" | "day";
    }> = [];

    const pNames = fd.getAll("pName").map(String);
    const pStarts = fd.getAll("pStart").map(String);
    const pEnds = fd.getAll("pEnd").map(String);
    for (let i = 0; i < pNames.length; i += 1) {
      const name = pNames[i]?.trim() ?? "";
      const startDate = pStarts[i]?.trim() ?? "";
      const endDate = pEnds[i]?.trim() ?? "";
      if (!startDate && !endDate) continue;
      if (!name || !startDate || !endDate) {
        schoolYearFlash =
          "Fyll inn navn, fra- og til-dato for hver ferieperiode du bruker — eller la raden stå tom.";
        render();
        return;
      }
      holidays.push({ name, startDate, endDate, kind: "period" });
    }

    const dNames = fd.getAll("dName").map(String);
    const dDates = fd.getAll("dDate").map(String);
    for (let i = 0; i < dNames.length; i += 1) {
      const name = dNames[i]?.trim() ?? "";
      const date = dDates[i]?.trim() ?? "";
      if (!name && !date) continue;
      if (!name || !date) {
        schoolYearFlash =
          "Fyll inn både navn og dato for ekstra fridager — eller la raden stå tom.";
        render();
        return;
      }
      holidays.push({ name, startDate: date, endDate: date, kind: "day" });
    }

    schoolYearFlash = "Genererer skoleårsplan…";
    render();
    try {
      const res = await fetch(`${API_BASE}/api/skolear/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSessionToken()}`
        },
        body: JSON.stringify({
          label: String(fd.get("label") ?? "").trim() || undefined,
          startDate: String(fd.get("startDate")),
          endDate: String(fd.get("endDate")),
          holidays
        })
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        teachingWeeks?: number;
        holidayWeeks?: number;
        profile?: { startWeek?: number; startDate?: string };
      };
      if (!res.ok || !data.success) {
        schoolYearFlash = data.error ?? "Kunne ikke lagre skoleår.";
        render();
        return;
      }
      await refreshPlanFromApi();
      const startWeek = data.profile?.startWeek ?? schoolYearInfo?.startWeek;
      schoolYearFlash =
        (data.message ?? "Skoleåret er lagret og planen er generert.") +
        (startWeek != null
          ? ` Planen starter skoleuke ${startWeek}${
              data.profile?.startDate ? ` (${data.profile.startDate})` : ""
            }. ${data.teachingWeeks ?? "?"} undervisningsuker · ${data.holidayWeeks ?? "?"} hele ferieuker låst.`
          : ` ${data.teachingWeeks ?? "?"} undervisningsuker · ${data.holidayWeeks ?? "?"} hele ferieuker låst.`);
      render();
    } catch {
      schoolYearFlash = "Kunne ikke nå serveren.";
      render();
    }
  });
}

function bindEkstraForm(): void {
  document.getElementById("ekstra-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const nivaer = fd.getAll("niva").map(String) as Array<"enklere" | "vanskeligere">;
    const temaer = fd.getAll("tema").map(String);
    if (nivaer.length === 0) {
      ekstraFlash = "Huk av minst ett nivå (enklere og/eller vanskeligere).";
      render();
      return;
    }
    if (temaer.length === 0) {
      ekstraFlash = "Huk av minst ett tema.";
      render();
      return;
    }
    const mode = String(fd.get("mode") || "all") as "all" | "one";
    const motaker = String(fd.get("motaker") ?? "").trim();
    if (mode === "one" && !motaker) {
      ekstraFlash = "Skriv inn e-postadresse når du sender til én mottaker.";
      render();
      return;
    }

    ekstraFlash = "Genererer og sender ekstraoppgaver… Dette kan ta litt tid.";
    render();
    try {
      const res = await fetch(`${API_BASE}/api/hefte/ekstra`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getSessionToken()}`
        },
        body: JSON.stringify({
          uke: Number(fd.get("uke")),
          nivaer,
          temaer,
          mode,
          motaker: mode === "one" ? motaker : undefined
        })
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      ekstraFlash = data.success ? (data.message ?? "Sendt.") : (data.error ?? "Sending feilet.");
      render();
    } catch {
      ekstraFlash = "Kunne ikke nå serveren. Prøv igjen om litt.";
      render();
    }
  });
}

function render(): void {
  if (!app) return;
  const { view, periode } = parseView();
  const copy = pageCopy(view, periode);
  let content = "";
  if (view === "skolear") content = renderSkolear();
  else if (view === "denne-uken") content = renderDenneUken();
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
  if (view === "skolear") {
    bindSkolearForm();
  }
  if (view === "denne-uken") {
    bindWeekStripNav();
    bindEkstraForm();
    if (isLoggedIn() && !recipientsFetched && !recipientsLoading) {
      void refreshRecipients().then(() => {
        if (parseView().view === "denne-uken") render();
      });
    }
  }
}

function bindWeekStripNav(): void {
  const uker = buildUkeVisninger(plan, effectiveUker);
  if (!uker.length) return;

  const todayUke = getIsoWeekNumber();
  const resolveCenterIdx = (): number => {
    if (nowStripCenterUke != null) {
      const i = uker.findIndex((u) => u.uke === nowStripCenterUke);
      if (i >= 0) return i;
    }
    const todayIdx = uker.findIndex((u) => u.uke === todayUke);
    return todayIdx >= 0 ? todayIdx : 0;
  };

  document.getElementById("week-strip-prev")?.addEventListener("click", () => {
    const idx = resolveCenterIdx();
    if (idx <= 0) return;
    nowStripCenterUke = uker[idx - 1]!.uke;
    render();
    document.querySelector(".week-strip-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("week-strip-next")?.addEventListener("click", () => {
    const idx = resolveCenterIdx();
    if (idx < 0 || idx >= uker.length - 1) return;
    nowStripCenterUke = uker[idx + 1]!.uke;
    render();
    document.querySelector(".week-strip-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });

  document.getElementById("week-strip-today")?.addEventListener("click", () => {
    nowStripCenterUke = null;
    render();
    document.querySelector(".week-strip-section")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

window.addEventListener("hashchange", () => {
  render();
});

await refreshPlanFromApi();
render();
