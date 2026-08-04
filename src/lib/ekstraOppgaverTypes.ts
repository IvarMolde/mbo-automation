import { z } from "zod";
import type { GrammatikkForklaring, Oppgave, TekstSeksjon } from "./types.js";

export const ekstraTemaSchema = z.enum([
  "lareverk",
  "yrke",
  "arbeidsnorsk",
  "hverdagssituasjon",
  "grammatikk"
]);

export const ekstraNivaSchema = z.enum(["enklere", "vanskeligere"]);

export type EkstraTema = z.infer<typeof ekstraTemaSchema>;
export type EkstraNiva = z.infer<typeof ekstraNivaSchema>;

export const ekstraTemaLabel: Record<EkstraTema, string> = {
  lareverk: "Læreverk",
  yrke: "Yrke",
  arbeidsnorsk: "Arbeidsnorsk",
  hverdagssituasjon: "Hverdagssituasjon",
  grammatikk: "Grammatikk"
};

export const ekstraNivaLabel: Record<EkstraNiva, string> = {
  enklere: "Enklere",
  vanskeligere: "Vanskeligere"
};

/** Map UI-tema to tematekst type used in prompts / Word. */
export function temaToTekstType(tema: EkstraTema): string {
  if (tema === "yrke") return "yrke_arbeidsnorsk";
  return tema;
}

export interface EkstraGrammatikkBlokk {
  forklaring: GrammatikkForklaring;
  /** Kort eksempeltekst der grammatikken brukes i sammenheng */
  eksempeltekst: {
    tittel: string;
    tekst: string;
  };
  oppgaver: Oppgave[];
}

export interface EkstraOppgaverData {
  niva: EkstraNiva;
  tekstSeksjoner: TekstSeksjon[];
  grammatikk?: EkstraGrammatikkBlokk;
  fasit: string;
}

export const ekstraOppgaverDataSchema = z.object({
  niva: ekstraNivaSchema,
  tekstSeksjoner: z.array(
    z.object({
      nummer: z.number().int().positive(),
      type: z.string().min(1),
      tittel: z.string().min(1),
      tekst: z.string().min(20),
      oppgaver: z.array(
        z.object({
          nummer: z.number().int().positive(),
          type: z.string().min(1),
          tittel: z.string().min(1),
          innhold: z.string().min(5)
        })
      ).min(1)
    })
  ),
  grammatikk: z
    .object({
      forklaring: z.object({
        tittel: z.string().min(1),
        forklaring: z.string().min(40),
        eksempler: z.array(z.string().min(3)).min(3),
        huskeregel: z.string().min(5).optional()
      }),
      eksempeltekst: z.object({
        tittel: z.string().min(1),
        tekst: z.string().min(40)
      }),
      oppgaver: z.array(
        z.object({
          nummer: z.number().int().positive(),
          type: z.string().min(1),
          tittel: z.string().min(1),
          innhold: z.string().min(5)
        })
      ).min(1)
    })
    .optional(),
  fasit: z.string().min(10)
});
