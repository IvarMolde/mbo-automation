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

function statusBadges(uke: UkeVisning): string {
  const parts: string[] = [];
  if (uke.erDagensUke) parts.push(`<span class="badge badge-now">Denne uken</span>`);
  if (uke.status === "locked") parts.push(`<span class="badge badge-lock">Låst</span>`);
  if (uke.status === "empty") parts.push(`<span class="badge badge-empty">Innhenting</span>`);
  if (uke.endret && uke.status === "teaching") {
    parts.push(`<span class="badge badge-changed">Endret</span>`);
  }
  return parts.join(" ");
}

export function renderUkeCard(uke: UkeVisning, open = false): string {
  const k = uke.kapittel;
  const title =
    uke.status === "locked"
      ? "Låst uke (ferie)"
      : uke.status === "empty"
        ? "Innhentingsuke (uten nytt kapittel)"
        : k
          ? escapeHtml(k.yrke || k.tittel)
          : "Uten kapittel";
  const grammatikk = k ? escapeHtml(k.grammatikk) : "—";
  const tema = k?.arbeidsnorskTema ? escapeHtml(k.arbeidsnorskTema) : "—";
  const niva = k ? escapeHtml((k.standardNiva ?? k.cefrNivaa.join("/")) || "—") : "—";
  const badges = statusBadges(uke);
  const cardClass = [
    "uke-card",
    uke.erDagensUke ? "is-current" : "",
    uke.status === "locked" ? "is-locked" : "",
    uke.status === "empty" ? "is-empty" : "",
    uke.endret ? "is-changed" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const details = k
    ? `
    <div class="uke-details">
      ${
        uke.endret && uke.baseKapittelNummer != null && uke.baseKapittelNummer !== k.nummer
          ? `<p class="note">Grunnplan hadde kapittel ${uke.baseKapittelNummer}. Gjeldende plan har kapittel ${k.nummer}.</p>`
          : ""
      }
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
    : `<div class="uke-details"><p class="muted">${
        uke.status === "locked"
          ? "Denne uken er låst (f.eks. ferie). Undervisningsinnhold hoppes over."
          : uke.status === "empty"
            ? "Uken er satt av til innhenting etter forskyvning. Ingen nytt kapittel."
            : "Ingen kapitteldata for denne uken."
      }</p></div>`;

  return `
    <article class="${cardClass}" id="uke-${uke.uke}">
      <details ${open ? "open" : ""}>
        <summary>
          <span class="uke-num">Uke ${uke.uke}</span>
          <span class="uke-main">
            <span class="uke-title">${title} ${badges}</span>
            <span class="uke-sub">${escapeHtml(uke.maned || "—")}${
              k ? ` · ${grammatikk}` : ""
            }</span>
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
          ${nav("veiledning", "Veiledning")}
          ${nav("admin", "Admin")}
          ${nav("om", "Om")}
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
      <p class="muted">Fase 2: lås ferieuker og forskyv planen. Se Veiledning for forklaringer.</p>
    </footer>
    <nav class="mobile-nav" aria-label="Hurtignavigasjon">
      ${nav("oversikt", "Oversikt")}
      ${nav("denne-uken", "Uken")}
      ${nav("veiledning", "Hjelp")}
      ${nav("admin", "Admin")}
    </nav>
  `;
}
