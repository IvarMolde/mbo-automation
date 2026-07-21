import planJson from "../../data/arsplan-2026-2027.json";
import { getIsoWeekNumber, getIsoWeekYear } from "./isoWeek";
import { buildUkeVisninger, escapeHtml, findUke } from "./plan";
import type { ArsplanDokument, ViewId } from "./types";
import { renderShell, renderUkeCard } from "./ui";
import "./style.css";

const plan = planJson as ArsplanDokument;
const app = document.querySelector<HTMLDivElement>("#app");

function parseView(): { view: ViewId; periode?: string } {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [raw, query = ""] = hash.split("?");
  const view = (raw || "oversikt") as ViewId;
  const params = new URLSearchParams(query);
  const periode = params.get("m") ?? undefined;
  if (view === "oversikt" || view === "denne-uken" || view === "perioder" || view === "om") {
    return { view, periode };
  }
  return { view: "oversikt" };
}

function currentWeekLabel(): string {
  const uke = getIsoWeekNumber();
  const year = getIsoWeekYear();
  const match = findUke(plan, uke);
  if (match?.kapittel) {
    return `ISO-uke ${uke} (${year}) · Kap. ${match.kapittel.nummer} ${match.kapittel.yrke}`;
  }
  return `ISO-uke ${uke} (${year}) · ikke i inneværende skoleårsplan`;
}

function renderOversikt(filterManed?: string): string {
  const uker = buildUkeVisninger(plan);
  const perioder = filterManed
    ? plan.perioder.filter((p) => p.maned === filterManed)
    : plan.perioder;

  if (!perioder.length) {
    return `<p role="status">Fant ingen periode som matcher.</p>`;
  }

  return perioder
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
    .join("");
}

function renderDenneUken(): string {
  const uke = getIsoWeekNumber();
  const match = findUke(plan, uke);
  if (!match) {
    return `
      <div class="panel">
        <p>Uke ${uke} finnes ikke i årsplanen for ${escapeHtml(plan.metadata.skolear ?? "dette skoleåret")}.</p>
        <p class="muted">Skoleåret starter typisk rundt uke 34. Gå til oversikten for å bla i hele planen.</p>
        <p><a class="btn" href="#/oversikt">Gå til oversikt</a></p>
      </div>
    `;
  }
  return `
    <div class="panel highlight">
      <p class="lede">Her er planen for inneværende ISO-uke. Åpne detaljer for tematekster, oppgaver og test.</p>
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
        <div><dt>Samarbeid</dt><dd>${escapeHtml(m.samarbeidspartner ?? "—")}</dd></div>
        <div><dt>Skoleår</dt><dd>${escapeHtml(m.skolear ?? "—")}</dd></div>
        <div><dt>Periode</dt><dd>${escapeHtml(m.periode ?? "—")}</dd></div>
        <div><dt>Målgruppe</dt><dd>${escapeHtml(m.malgruppe ?? "—")}</dd></div>
        <div><dt>Nivå</dt><dd>${escapeHtml((m.norskniva ?? []).join(", ") || "—")}</dd></div>
        <div><dt>Kapitler</dt><dd>${m.antallKapitler ?? plan.kapitler.length}</dd></div>
      </dl>
      ${m.notat ? `<p class="note">${escapeHtml(m.notat)}</p>` : ""}
      <h2>Om denne nettsiden</h2>
      <p>Du ser grunnplanen fra årsplan-filen i GitHub. Senere kan planen forskyves ved forsinkelser, og uker kan låses for ferier. E-postmottakere administreres i en egen admin-del.</p>
    </div>
  `;
}

function pageCopy(view: ViewId, periode?: string): { title: string; subtitle: string } {
  switch (view) {
    case "denne-uken":
      return {
        title: "Denne uken",
        subtitle: "Hva står på planen nå – åpne detaljer for hele formuleringen."
      };
    case "perioder":
      return {
        title: "Perioder",
        subtitle: "Velg en måned for å hoppe rett til ukene i perioden."
      };
    case "om":
      return {
        title: "Om planen",
        subtitle: "Bakgrunn for MBO-årsplanen 2026–2027."
      };
    default:
      return {
        title: periode ? `Oversikt · ${periode}` : "Årsplan uke for uke",
        subtitle: periode
          ? `Uker i ${periode}. Bruk «Åpne detaljer» for full formulering.`
          : "Kompakt oversikt. Åpne detaljer for tematekster, oppgaver, ordliste og test."
      };
  }
}

function render(): void {
  if (!app) return;
  const { view, periode } = parseView();
  const copy = pageCopy(view, periode);
  let content = "";
  if (view === "denne-uken") content = renderDenneUken();
  else if (view === "perioder") content = renderPerioder();
  else if (view === "om") content = renderOm();
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

  // Update summary label when open/closed for clearer UX
  app.querySelectorAll<HTMLDetailsElement>(".uke-card details").forEach((d) => {
    const action = d.querySelector(".uke-action");
    const sync = () => {
      if (action) action.textContent = d.open ? "Lukk detaljer" : "Åpne detaljer";
    };
    sync();
    d.addEventListener("toggle", sync);
  });
}

window.addEventListener("hashchange", render);
render();
