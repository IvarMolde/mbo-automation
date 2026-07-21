import { z } from "zod";

/** CEFR-nivå brukt i dagens kapittelmodell (types.ts) */
export const cefrNivaaKapittelSchema = z.enum(["A2", "B1"]);
export type CefrNivaaKapittel = z.infer<typeof cefrNivaaKapittelSchema>;

/** Utvidet nivåskala for opplastet årsplan / CEFR-referanse */
export const cefrNivaaFullSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
export type CefrNivaaFull = z.infer<typeof cefrNivaaFullSchema>;

export const dokumentFormatSchema = z.enum(["docx"]);
export type DokumentFormat = z.infer<typeof dokumentFormatSchema>;

// ── Kapittel + CEFR can-do (matcher src/lib/types.ts) ───────────────────────

export const cefrCanDoSchema = z.object({
  resepsjon: z.array(z.string().max(2000)).min(1).max(30),
  samhandling: z.array(z.string().max(2000)).min(1).max(30),
  produksjon: z.array(z.string().max(2000)).min(1).max(30)
});

export type CefrCanDoValidated = z.infer<typeof cefrCanDoSchema>;

export const kapittelSchema = z.object({
  nummer: z.number().int().positive(),
  yrke: z.string().min(1).max(300),
  grammatikk: z.string().min(1).max(2000),
  arbeidsnorskTema: z.string().min(1).max(500),
  cefrNivaa: cefrNivaaKapittelSchema,
  cefrCanDo: cefrCanDoSchema,
  periodeFokus: z.string().max(2000).optional(),
  tematekster: z
    .array(
      z.object({
        nummer: z.number().int().positive(),
        tittel: z.string().max(500),
        type: z.string().max(120)
      })
    )
    .max(50)
    .optional(),
  oppgavestruktur: z
    .array(
      z.object({
        nummer: z.number().int().positive(),
        type: z.string().max(120),
        beskrivelse: z.string().max(2000)
      })
    )
    .max(30)
    .optional(),
  ordlisteAntall: z.number().int().nonnegative().optional(),
  kapitteltestAntall: z.number().int().nonnegative().optional(),
  fasitInstruks: z.string().max(5000).optional()
});

export type KapittelValidated = z.infer<typeof kapittelSchema>;

// ── Årsplan (strukturert JSON etter opplasting/konvertering) ────────────────

export const arsplanMetadataSchema = z.object({
  tittel: z.string().max(500),
  kurs: z.string().max(500).optional(),
  organisasjon: z.string().max(300).optional(),
  samarbeidspartner: z.string().max(300).optional(),
  skolear: z.string().max(80).optional(),
  periode: z.string().max(200).optional(),
  malgruppe: z.string().max(500).optional(),
  norskniva: z.array(cefrNivaaFullSchema).max(10).optional(),
  antallKapitler: z.number().int().nonnegative().optional(),
  kilde: z.string().max(2000).optional(),
  konvertertFra: z.string().max(500).optional(),
  konvertertTidspunkt: z.string().max(80).optional(),
  notat: z.string().max(5000).optional()
});

export const arsplanPeriodeSchema = z.object({
  maned: z.string().max(80),
  ukeStart: z.number().int().min(1).max(53),
  ukeSlutt: z.number().int().min(1).max(53),
  uker: z.array(z.number().int().min(1).max(53)).min(1),
  kapitler: z.array(z.number().int().positive()).min(1),
  fokus: z.string().max(2000)
});

export const arsplanUkeOppslagSchema = z.object({
  uke: z.number().int().min(1).max(53),
  kapittel: z.number().int().positive(),
  maned: z.string().max(80),
  periodeFokus: z.string().max(2000)
});

export const tematekstTypeSchema = z.enum([
  "lareverk",
  "yrke_arbeidsnorsk",
  "arbeidsnorsk",
  "hverdagssituasjon"
]);

export const arsplanTematekstSchema = z.object({
  nummer: z.number().int().positive(),
  tittel: z.string().max(500),
  type: tematekstTypeSchema
});

export const arsplanOppgavestrukturKapittelSchema = z.object({
  nummer: z.number().int().positive(),
  type: z.string().max(120),
  beskrivelse: z.string().max(2000)
});

export const arsplanKapittelSchema = z.object({
  nummer: z.number().int().positive(),
  tittel: z.string().max(500),
  maned: z.string().max(80),
  ukeStart: z.number().int().min(1).max(53),
  ukeSlutt: z.number().int().min(1).max(53),
  uker: z.array(z.number().int().min(1).max(53)).min(1),
  periodeFokus: z.string().max(2000),
  cefrNivaa: z.array(cefrNivaaFullSchema).min(1).max(10),
  standardNiva: cefrNivaaFullSchema.optional(),
  grammatikk: z.string().max(2000),
  yrke: z.string().max(300),
  arbeidsnorskTema: z.string().max(500).optional(),
  tematekster: z.array(arsplanTematekstSchema).max(50).optional(),
  oppgavestruktur: z.array(arsplanOppgavestrukturKapittelSchema).max(30).optional(),
  ordliste: z
    .object({
      antall: z.number().int().nonnegative().optional(),
      beskrivelse: z.string().max(2000).optional()
    })
    .optional(),
  kapitteltest: z
    .object({
      antallOppgaver: z.number().int().nonnegative().optional(),
      poengPerOppgave: z.number().nonnegative().optional(),
      totalPoeng: z.number().nonnegative().optional()
    })
    .optional(),
  fasit: z.string().max(5000).optional()
});

export const arsplanDokumentSchema = z.object({
  metadata: arsplanMetadataSchema,
  perioder: z.array(arsplanPeriodeSchema).min(1).max(24),
  uker: z.array(arsplanUkeOppslagSchema).min(1).max(60),
  kapitler: z.array(arsplanKapittelSchema).min(1).max(100)
});

export type ArsplanDokument = z.infer<typeof arsplanDokumentSchema>;

/** Smal ukekontekst for cron/Gemini etter oppslag i årsplan */
export const arsplanUkeKontekstSchema = z.object({
  isoUke: z.number().int().min(1).max(53),
  skoleAr: z.string().max(40).optional(),
  datoPeriode: z.string().max(120).optional(),
  tema: z.string().max(2000),
  yrke: z.string().max(300),
  grammatikk: z.string().max(2000),
  nivaa: z.array(cefrNivaaFullSchema).min(1).max(6),
  mal: z.array(z.string().max(1000)).max(30).optional(),
  onskedeAktiviteter: z.array(z.string().max(500)).max(40).optional(),
  kapittelNummer: z.number().int().positive().optional(),
  arbeidsnorskTema: z.string().max(500).optional()
});

export type ArsplanUkeKontekst = z.infer<typeof arsplanUkeKontekstSchema>;

export const arsplanTekstOpplastingSchema = z.object({
  filnavn: z.string().max(260).optional(),
  innhold: z.string().min(1).max(2_000_000),
  format: z.enum(["markdown", "plain", "json"]).default("markdown")
});

export type ArsplanTekstOpplasting = z.infer<typeof arsplanTekstOpplastingSchema>;

// ── CEFR-referanse (opplastet) ──────────────────────────────────────────────

export const cefrNivaaBeskrivelseSchema = z.object({
  nivaa: cefrNivaaFullSchema,
  tittel: z.string().max(200).optional(),
  generellBeskrivelse: z.string().min(1).max(50_000),
  kanGjorePunkter: z.array(z.string().max(2000)).max(200).optional(),
  tilleggNotat: z.string().max(20_000).optional()
});

export const cefrDokumentSchema = z.object({
  metadata: z
    .object({
      kilde: z.string().max(2000).optional(),
      versjon: z.string().max(80).optional(),
      sprak: z.string().max(40).optional().default("no")
    })
    .optional(),
  nivaaer: z.array(cefrNivaaBeskrivelseSchema).min(1).max(12)
});

export type CefrDokument = z.infer<typeof cefrDokumentSchema>;

export const cefrTekstOpplastingSchema = z.object({
  filnavn: z.string().max(260).optional(),
  innhold: z.string().min(1).max(1_000_000),
  format: z.enum(["markdown", "plain", "json"]).default("markdown")
});

export type CefrTekstOpplasting = z.infer<typeof cefrTekstOpplastingSchema>;

/** JSON som beskriver can-do pr. nivå (alternativ til fritekst-dokument) */
export const cefrCanDoPerNivaaSchema = z.object({
  nivaa: cefrNivaaFullSchema,
  canDo: cefrCanDoSchema
});

export const cefrCanDoSamlingSchema = z.object({
  nivaaer: z.array(cefrCanDoPerNivaaSchema).min(1).max(12)
});

export type CefrCanDoSamling = z.infer<typeof cefrCanDoSamlingSchema>;

// ── Generert undervisningsopplegg (Gemini → validering → dokumenter) ───────

/** Gemini-kontrakt: følger årsplanens tematekster + oppgavestruktur. */
export const arbeidshefteOppgaveSchema = z.object({
  nummer: z.number().int().positive().max(20),
  type: z.string().min(1).max(120),
  tittel: z.string().min(3).max(500),
  innhold: z.string().min(15).max(20_000)
});

export const arbeidshefteTekstSeksjonSchema = z.object({
  nummer: z.number().int().positive().max(20),
  type: z.string().min(1).max(120),
  tittel: z.string().min(3).max(500),
  tekst: z.string().min(40).max(80_000),
  oppgaver: z.array(arbeidshefteOppgaveSchema).min(3).max(6)
});

export const arbeidshefteDataSchema = z.object({
  tekstSeksjoner: z.array(arbeidshefteTekstSeksjonSchema).min(3).max(6),
  ordliste: z
    .array(
      z.object({
        ord: z.string().min(1).max(500),
        forklaring: z.string().min(3).max(2000),
        eksempel: z.string().min(6).max(4000)
      })
    )
    .min(15)
    .max(25),
  kapitteltest: z
    .array(
      z.object({
        nummer: z.number().int().positive().max(20),
        innhold: z.string().min(10).max(20_000)
      })
    )
    .min(5)
    .max(12),
  fasit: z.string().min(20).max(100_000)
});

export type ArbeidshefteDataValidated = z.infer<typeof arbeidshefteDataSchema>;

export const generertUndervisningsoppleggSchema = z.object({
  arbeidshefte: arbeidshefteDataSchema,
  ukeKontekst: arsplanUkeKontekstSchema.optional(),
  kapittel: kapittelSchema.optional(),
  generertTidspunktIso: z.string().max(40).optional(),
  formater: z.array(dokumentFormatSchema).min(1).max(2).optional()
});

export type GenerertUndervisningsopplegg = z.infer<typeof generertUndervisningsoppleggSchema>;

// ── Drift / logging (ingen sensitive felter) ───────────────────────────────

export const ukentligJobbStatusSchema = z.enum([
  "plan_lastet",
  "generert",
  "validert",
  "dokumenter_bygget",
  "sendt",
  "feilet",
  "varslet_manglende_uke"
]);

export type UkentligJobbStatus = z.infer<typeof ukentligJobbStatusSchema>;

export const ukentligGenereringLogSchema = z.object({
  status: ukentligJobbStatusSchema,
  isoUke: z.number().int().min(1).max(53).optional(),
  tidspunktIso: z.string().max(40),
  melding: z.string().max(2000).optional(),
  feilKode: z.string().max(120).optional()
});

export type UkentligGenereringLog = z.infer<typeof ukentligGenereringLogSchema>;
