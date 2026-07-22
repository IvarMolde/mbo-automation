import planJson from "../../data/arsplan-2026-2027.json";
import { getIsoWeekNumber, getIsoWeekYear } from "./isoWeek";
import {
  getLocalEffectiveUker,
  loadLocalPlanState,
  saveLocalPlanState
} from "./localPlan";
import { buildUkeVisninger, escapeHtml, findUke, toArsplanDokument } from "./plan";
import { computeEffectiveSchedule, type PlanOperation, type PlanState } from "./schedule";
import type { ArsplanDokument, EffectiveUke, PlanApiResponse, ViewId } from "./types";
import { renderShell, renderUkeCard } from "./ui";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "https://mbo-automation-b8bi.vercel.app";

const SESSION_KEY = "mbo-admin-session-v1";

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

function parseView(): { view: ViewId; periode?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [raw, query = ""] = hash.split("?");
  const view = (raw || "oversikt") as ViewId;
  const params = new URLSearchParams(query);
  const periode = params.get("m") ?? undefined;
  if (
    view === "oversikt" ||
    view === "denne-uken" ||
    view === "perioder" ||
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
          : "/api/plan/reset";
  const body =
    op.type === "lock"
      ? { uke: op.uke, note: op.note }
      : op.type === "unlock"
        ? { uke: op.uke }
        : op.type === "shift"
          ? { fromUke: op.fromUke, weeks: op.weeks, note: op.note }
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
    return null;
  } catch {
    return "Kunne ikke nå serveren.";
  }
}

function logout(): void {
  setSessionToken("");
  adminFlash = "Du er logget ut.";
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

function renderOversikt(filterManed?: string): string {
  const uker = buildUkeVisninger(plan, effectiveUker);
  const perioder = filterManed
    ? plan.perioder.filter((p) => p.maned === filterManed)
    : plan.perioder;

  const sourceLabel =
    planSource === "local"
      ? "Endringer er lagret i denne nettleseren (Fase 2)."
      : planSource === "server"
        ? `Gjeldende plan fra server${apiStateUpdatedAt ? ` · ${escapeHtml(apiStateUpdatedAt)}` : ""}.`
        : "Du ser grunnplanen (ingen lås/forskyvning ennå).";

  const banner = loadError
    ? `<div class="panel note" role="status">${escapeHtml(sourceLabel)} API-varsel: ${escapeHtml(loadError)}.</div>`
    : `<div class="panel highlight">
          <p class="lede">${sourceLabel} Les mer under <a href="#/veiledning">Veiledning</a>.</p>
          <ul class="legend-list compact">
            <li><span class="badge badge-lock">Låst</span> ferie</li>
            <li><span class="badge badge-empty">Innhenting</span> ekstra tid</li>
            <li><span class="badge badge-changed">Endret</span> flyttet kapittel</li>
          </ul>
        </div>`;

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

function renderDenneUken(): string {
  const uke = getIsoWeekNumber();
  const match = findUke(plan, uke, effectiveUker);
  if (!match) {
    return `
      <div class="panel">
        <p>Uke ${uke} finnes ikke i årsplanen for ${escapeHtml(plan.metadata.skolear ?? "dette skoleåret")}.</p>
        <p><a class="btn" href="#/oversikt">Gå til oversikt</a></p>
      </div>
    `;
  }
  return `
    <div class="panel highlight">
      <p class="lede">Her er den gjeldende planen for inneværende ISO-uke.</p>
    </div>
    ${renderUkeCard(match, true)}
    <p class="after-link"><a href="#/oversikt">Se hele årsplanen</a></p>
  `;
}

function renderPerioder(): string {
  return `
    <div class="periode-grid" role="list">
      ${plan.perioder
        .map(
          (p) => `
        <a class="periode-tile" role="listitem" href="#/oversikt?m=${encodeURIComponent(p.maned)}">
          <h2>${escapeHtml(p.maned)}</h2>
          <p class="muted">Uke ${p.ukeStart}–${p.ukeSlutt}</p>
          <p>${escapeHtml(p.fokus)}</p>
        </a>`
        )
        .join("")}
    </div>
  `;
}

function renderOm(): string {
  const m = plan.metadata;
  return `
    <div class="panel prose">
      <dl class="meta-grid">
        <div><dt>Tittel</dt><dd>${escapeHtml(m.tittel)}</dd></div>
        <div><dt>Kurs</dt><dd>${escapeHtml(m.kurs ?? "—")}</dd></div>
        <div><dt>Organisasjon</dt><dd>${escapeHtml(m.organisasjon ?? "—")}</dd></div>
        <div><dt>Skoleår</dt><dd>${escapeHtml(m.skolear ?? "—")}</dd></div>
      </dl>
      <h2>Dynamisk plan</h2>
      <p>
        Grunnplanen er fasiten for skoleåret. Underveis kan du tilpasse den:
        låse ferieuker og forskyve kapitler når klassen trenger mer tid.
        Gå til <a href="#/admin">Admin</a> for å gjøre endringer — der står også
        forklaringer på hvert valg.
      </p>
    </div>
  `;
}

function renderVeiledning(): string {
  return `
    <div class="panel prose help-box">
      <h2>Hva er Fase 2?</h2>
      <p>
        Fase 2 gjør årsplanen <strong>fleksibel</strong>. Grunnplanen ligger fast i systemet,
        men du kan tilpasse den underveis i skoleåret — uten å skrive om hele planen.
      </p>
    </div>

    <div class="panel prose">
      <h2>To planer å huske</h2>
      <dl class="meta-grid">
        <div>
          <dt>Grunnplan</dt>
          <dd>Den opprinnelige årsplanen (uke for uke). Dette er «fasiten».</dd>
        </div>
        <div>
          <dt>Gjeldende plan</dt>
          <dd>Det som gjelder nå, etter at du har låst ferieuker eller forskjøvet innhold.</dd>
        </div>
      </dl>
    </div>

    <div class="panel prose">
      <h2>1. Lås uke</h2>
      <div class="help-text">
        <p><strong>Når bruker du det?</strong> Når det ikke skal være undervisning: høstferie, jul, vinterferie, 1. mai, 17. mai.</p>
        <p><strong>Hva skjer?</strong> Uken merkes <span class="badge badge-lock">Låst</span>. Kapitler som lå der, flyttes til neste ledige uke. Planen hopper over ferien.</p>
        <p><strong>Eksempel:</strong> Lås uke 40 som høstferie → innholdet fra uke 40 kommer i uke 41 (eller neste ulåste uke).</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>2. Lås opp uke</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Hvis du låste feil uke, eller ferien ble flyttet.</p>
        <p><strong>Hva skjer?</strong> Ferie-merket fjernes. Innhold trekkes ikke automatisk tilbake. Bruk forskyvning eller tilbakestill hvis du vil rydde planen.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>3. Forskyv plan</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Klassen ble ikke ferdig med et emne og trenger mer tid.</p>
        <p><strong>Hva skjer?</strong> Fra valgt uke og fremover skyves kapitlene frem. De første ukene blir <span class="badge badge-empty">Innhenting</span> (ingen nytt kapittel). Låste uker hoppes over.</p>
        <p><strong>Eksempel:</strong> Fra uke 36, 1 uke frem → uke 36 blir innhenting, og kapittelet som sto der flyttes til neste ledige uke.</p>
      </div>
    </div>

    <div class="panel prose">
      <h2>4. Tilbakestill</h2>
      <div class="help-text">
        <p><strong>Når?</strong> Bare hvis du vil slette alle lås og forskyvninger.</p>
        <p><strong>Obs:</strong> Da er du tilbake til grunnplanen. Handlingen kan ikke angres.</p>
      </div>
    </div>

    <div class="panel prose help-box">
      <h2>Merkene i oversikten</h2>
      <ul class="legend-list">
        <li><span class="badge badge-now">Denne uken</span> — inneværende ISO-uke</li>
        <li><span class="badge badge-lock">Låst</span> — ferie / ingen undervisning</li>
        <li><span class="badge badge-empty">Innhenting</span> — ekstra tid etter forskyvning</li>
        <li><span class="badge badge-changed">Endret</span> — kapittelet er flyttet fra grunnplanen</li>
      </ul>
      <p class="after-link"><a class="btn" href="#/admin">Gå til Admin og prøv</a></p>
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
      return { title: "Denne uken", subtitle: "Gjeldende plan for inneværende ISO-uke." };
    case "perioder":
      return { title: "Perioder", subtitle: "Velg en måned for å hoppe til ukene i perioden." };
    case "veiledning":
      return {
        title: "Veiledning — Fase 2",
        subtitle: "Tydelige forklaringer på lås, forskyvning og merkene i oversikten."
      };
    case "om":
      return { title: "Om planen", subtitle: "Bakgrunn for MBO-årsplanen 2026–2027." };
    case "admin":
      return {
        title: "Admin — tilpass planen",
        subtitle: isLoggedIn()
          ? "Du er innlogget. Lås ferieuker og forskyv undervisningen."
          : "Logg inn med admin-passord for å redigere planen."
      };
    default:
      return {
        title: periode ? `Oversikt · ${periode}` : "Årsplan uke for uke",
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
  else if (view === "perioder") content = renderPerioder();
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

  if (view === "admin") bindAdminForms();
}

window.addEventListener("hashchange", () => {
  render();
});

await refreshPlanFromApi();
render();
