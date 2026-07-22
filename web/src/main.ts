import planJson from "../../data/arsplan-2026-2027.json";
import { getIsoWeekNumber, getIsoWeekYear } from "./isoWeek";
import { buildUkeVisninger, escapeHtml, findUke, toArsplanDokument } from "./plan";
import type { ArsplanDokument, EffectiveUke, PlanApiResponse, ViewId } from "./types";
import { renderShell, renderUkeCard } from "./ui";
import "./style.css";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "")
  ?? "https://mbo-automation-b8bi.vercel.app";

const TOKEN_KEY = "mbo-admin-token";

const app = document.querySelector<HTMLDivElement>("#app");

let plan: ArsplanDokument = planJson as ArsplanDokument;
let effectiveUker: EffectiveUke[] | undefined;
let apiMeta: PlanApiResponse["store"] | null = null;
let apiStateUpdatedAt: string | null = null;
let loadError: string | null = null;

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
    view === "om" ||
    view === "admin"
  ) {
    return { view, periode };
  }
  return { view: "oversikt" };
}

function getToken(): string {
  return sessionStorage.getItem(TOKEN_KEY) ?? "";
}

function setToken(token: string): void {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

async function refreshPlanFromApi(): Promise<void> {
  loadError = null;
  try {
    const res = await fetch(`${API_BASE}/api/plan`);
    if (!res.ok) throw new Error(`API svarte ${res.status}`);
    const data = (await res.json()) as PlanApiResponse;
    if (!data.success) throw new Error("Ugyldig plansvar");
    plan = toArsplanDokument(data);
    effectiveUker = data.effective.uker;
    apiMeta = data.store;
    apiStateUpdatedAt = data.state.updatedAt;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Kunne ikke hente dynamisk plan";
    effectiveUker = undefined;
    apiMeta = null;
    plan = planJson as ArsplanDokument;
  }
}

async function adminPost(path: string, body: Record<string, unknown>): Promise<string | null> {
  const token = getToken();
  if (!token) return "Legg inn admin-token først.";
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !data.success) {
      return data.error ?? `Feil ${res.status}`;
    }
    await refreshPlanFromApi();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Nettverksfeil";
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

function renderOversikt(filterManed?: string): string {
  const uker = buildUkeVisninger(plan, effectiveUker);
  const perioder = filterManed
    ? plan.perioder.filter((p) => p.maned === filterManed)
    : plan.perioder;

  const banner = loadError
    ? `<div class="panel note" role="status">Viser lokal grunnplan (API utilgjengelig: ${escapeHtml(loadError)}).</div>`
    : apiMeta
      ? `<div class="panel highlight"><p class="lede">Gjeldende plan fra API${
          apiStateUpdatedAt ? ` · oppdatert ${escapeHtml(apiStateUpdatedAt)}` : ""
        }${apiMeta.writable ? "" : " · lagring krever Turso på server"}.</p></div>`
      : "";

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
      <p>Du kan låse ferieuker og forskyve resten av planen fra Admin. Grunnplanen ligger i GitHub; endringer lagres via API.</p>
    </div>
  `;
}

function renderAdmin(): string {
  const ukeNow = getIsoWeekNumber();
  return `
    <div class="panel prose">
      <p>Kun administrator. Bruk tokenet som er satt som <code>ADMIN_TOKEN</code> på Vercel.</p>
      <form id="admin-token-form" class="admin-form">
        <label for="admin-token">Admin-token</label>
        <input id="admin-token" name="token" type="password" autocomplete="current-password" value="${escapeHtml(getToken())}" />
        <button type="submit" class="btn">Lagre token i denne nettleseren</button>
      </form>
      <p class="muted" id="admin-status" role="status"></p>
    </div>

    <div class="admin-grid">
      <form id="lock-form" class="panel admin-form">
        <h2>Lås uke (ferie)</h2>
        <label for="lock-uke">Ukenummer</label>
        <input id="lock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="lock-note">Notat (valgfritt)</label>
        <input id="lock-note" name="note" type="text" maxlength="300" placeholder="Høstferie" />
        <button type="submit" class="btn">Lås uke</button>
      </form>

      <form id="unlock-form" class="panel admin-form">
        <h2>Lås opp uke</h2>
        <label for="unlock-uke">Ukenummer</label>
        <input id="unlock-uke" name="uke" type="number" min="1" max="53" required value="${ukeNow}" />
        <button type="submit" class="btn">Lås opp</button>
      </form>

      <form id="shift-form" class="panel admin-form">
        <h2>Forskyv plan</h2>
        <p class="muted">Flytter innhold fra valgt uke og fremover. Hopper over låste uker.</p>
        <label for="shift-from">Fra uke</label>
        <input id="shift-from" name="fromUke" type="number" min="1" max="53" required value="${ukeNow}" />
        <label for="shift-weeks">Antall uker frem</label>
        <input id="shift-weeks" name="weeks" type="number" min="1" max="20" required value="1" />
        <label for="shift-note">Notat (valgfritt)</label>
        <input id="shift-note" name="note" type="text" maxlength="300" placeholder="Trenger mer tid på tema" />
        <button type="submit" class="btn">Forskyv</button>
      </form>

      <form id="reset-form" class="panel admin-form">
        <h2>Tilbakestill</h2>
        <p class="muted">Gjenoppretter grunnplanen (fjerner lås og forskyvninger).</p>
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
    case "om":
      return { title: "Om planen", subtitle: "Bakgrunn for MBO-årsplanen 2026–2027." };
    case "admin":
      return {
        title: "Admin",
        subtitle: "Lås ferieuker og forskyv planen når et emne trenger mer tid."
      };
    default:
      return {
        title: periode ? `Oversikt · ${periode}` : "Årsplan uke for uke",
        subtitle: "Kompakt oversikt over gjeldende plan. Åpne detaljer for full formulering."
      };
  }
}

function bindAdminForms(): void {
  const status = document.getElementById("admin-status");
  const setStatus = (msg: string) => {
    if (status) status.textContent = msg;
  };

  document.getElementById("admin-token-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setToken(String(fd.get("token") ?? "").trim());
    setStatus("Token lagret i denne nettleserøkten.");
  });

  document.getElementById("lock-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setStatus("Låser uke…");
    const err = await adminPost("/api/plan/lock", {
      uke: Number(fd.get("uke")),
      note: String(fd.get("note") ?? "") || undefined
    });
    setStatus(err ?? "Uke låst. Planen er oppdatert.");
    if (!err) render();
  });

  document.getElementById("unlock-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setStatus("Låser opp…");
    const err = await adminPost("/api/plan/unlock", { uke: Number(fd.get("uke")) });
    setStatus(err ?? "Uke låst opp.");
    if (!err) render();
  });

  document.getElementById("shift-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target as HTMLFormElement);
    setStatus("Forskyver…");
    const err = await adminPost("/api/plan/shift", {
      fromUke: Number(fd.get("fromUke")),
      weeks: Number(fd.get("weeks")),
      note: String(fd.get("note") ?? "") || undefined
    });
    setStatus(err ?? "Plan forskjøvet.");
    if (!err) render();
  });

  document.getElementById("reset-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!window.confirm("Tilbakestille hele planen til grunnplanen?")) return;
    setStatus("Tilbakestiller…");
    const err = await adminPost("/api/plan/reset", {});
    setStatus(err ?? "Tilbakestilt til grunnplan.");
    if (!err) render();
  });
}

function render(): void {
  if (!app) return;
  const { view, periode } = parseView();
  const copy = pageCopy(view, periode);
  let content = "";
  if (view === "denne-uken") content = renderDenneUken();
  else if (view === "perioder") content = renderPerioder();
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
