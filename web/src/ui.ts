import type { UkeVisning, ViewId } from "./types";
import { escapeHtml } from "./plan";

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    lareverk: "Læreverk",
    yrke_arbeidsnorsk: "Yrke / arbeidsnorsk",
    arbeidsnorsk: "Arbeidsnorsk",
    hverdagssituasjon: "Hverdagssituasjon"
  };
  return map[type] ?? type;
}

export function renderUkeCard(uke: UkeVisning, open = false): string {
  const k = uke.kapittel;
  const title = k ? escapeHtml(k.yrke || k.tittel) : "Uten kapittel";
  const grammatikk = k ? escapeHtml(k.grammatikk) : "—";
  const tema = k?.arbeidsnorskTema ? escapeHtml(k.arbeidsnorskTema) : "—";
  const niva = k ? escapeHtml((k.standardNiva ?? k.cefrNivaa.join("/")) || "—") : "—";
  const badge = uke.erDagensUke ? `<span class="badge badge-now">Denne uken</span>` : "";

  const details = k
    ? `
    <div class="uke-details">
      <p class="lede">${escapeHtml(k.periodeFokus || uke.periodeFokus)}</p>
      <dl class="meta-grid">
        <div><dt>Kapittel</dt><dd>${k.nummer}. ${escapeHtml(k.tittel)}</dd></div>
        <div><dt>Nivå</dt><dd>${niva}</dd></div>
        <div><dt>Grammatikk</dt><dd>${grammatikk}</dd></div>
        <div><dt>Arbeidsnorsk</dt><dd>${tema}</dd></div>
      </dl>
      ${
        k.tematekster?.length
          ? `<h4>Tematekster</h4>
        <ol class="plain-list">
          ${k.tematekster
            .map(
              (t) =>
                `<li><span class="muted">${escapeHtml(typeLabel(t.type))}:</span> ${escapeHtml(t.tittel)}</li>`
            )
            .join("")}
        </ol>`
          : ""
      }
      ${
        k.oppgavestruktur?.length
          ? `<h4>Oppgaver under hver tekst</h4>
        <ol class="plain-list">
          ${k.oppgavestruktur
            .map(
              (o) =>
                `<li><strong>${escapeHtml(o.type)}</strong> — ${escapeHtml(o.beskrivelse)}</li>`
            )
            .join("")}
        </ol>`
          : ""
      }
      <dl class="meta-grid compact">
        <div><dt>Ordliste</dt><dd>${k.ordliste?.antall ?? "—"} ord${
          k.ordliste?.beskrivelse ? ` · ${escapeHtml(k.ordliste.beskrivelse)}` : ""
        }</dd></div>
        <div><dt>Kapitteltest</dt><dd>${
          k.kapitteltest?.antallOppgaver ?? "—"
        } oppgaver${
          k.kapitteltest?.totalPoeng != null ? ` · ${k.kapitteltest.totalPoeng} poeng` : ""
        }</dd></div>
        <div><dt>Fasit</dt><dd>${escapeHtml(k.fasit ?? "—")}</dd></div>
      </dl>
    </div>`
    : `<p class="muted">Ingen kapitteldata for denne uken.</p>`;

  return `
    <article class="uke-card${uke.erDagensUke ? " is-current" : ""}" id="uke-${uke.uke}">
      <details ${open ? "open" : ""}>
        <summary>
          <span class="uke-num">Uke ${uke.uke}</span>
          <span class="uke-main">
            <span class="uke-title">${title} ${badge}</span>
            <span class="uke-sub">${escapeHtml(uke.maned)} · ${grammatikk}</span>
          </span>
          <span class="uke-action">Åpne detaljer</span>
        </summary>
        ${details}
      </details>
    </article>
  `;
}

export function renderShell(opts: {
  active: ViewId;
  title: string;
  subtitle: string;
  content: string;
  currentWeekLabel: string;
}): string {
  const nav = (id: ViewId, label: string) =>
    `<a href="#/${id}" class="nav-link${opts.active === id ? " is-active" : ""}" ${
      opts.active === id ? 'aria-current="page"' : ""
    }>${label}</a>`;

  return `
    <header class="site-header">
      <div class="header-inner">
        <div class="brand">
          <p class="brand-kicker">Molde voksenopplæring</p>
          <a class="brand-title" href="#/oversikt">MBO Årsplan</a>
        </div>
        <p class="header-week" aria-live="polite">${escapeHtml(opts.currentWeekLabel)}</p>
        <button type="button" class="nav-toggle" aria-expanded="false" aria-controls="hovedmeny" id="nav-toggle">
          Meny
        </button>
        <nav id="hovedmeny" class="main-nav" aria-label="Hovedmeny">
          ${nav("oversikt", "Oversikt")}
          ${nav("denne-uken", "Denne uken")}
          ${nav("perioder", "Perioder")}
          ${nav("om", "Om planen")}
        </nav>
      </div>
    </header>
    <main id="hovedinnhold" class="main" tabindex="-1">
      <header class="page-header">
        <h1>${escapeHtml(opts.title)}</h1>
        <p class="page-sub">${escapeHtml(opts.subtitle)}</p>
      </header>
      ${opts.content}
    </main>
    <footer class="site-footer">
      <p>Arbeid og norsk · MBO A2–B1 · Årsplan 2026–2027</p>
      <p class="muted">Fase 1: lese årsplan. Forskyvning og e-postmottakere kommer i neste faser.</p>
    </footer>
    <nav class="mobile-nav" aria-label="Hurtignavigasjon">
      ${nav("oversikt", "Oversikt")}
      ${nav("denne-uken", "Uken")}
      ${nav("perioder", "Perioder")}
      ${nav("om", "Om")}
    </nav>
  `;
}
