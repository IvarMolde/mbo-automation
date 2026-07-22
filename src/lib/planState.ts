import { z } from "zod";

export const planOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("lock"),
    uke: z.number().int().min(1).max(53),
    at: z.string().max(40),
    note: z.string().max(300).optional()
  }),
  z.object({
    type: z.literal("unlock"),
    uke: z.number().int().min(1).max(53),
    at: z.string().max(40)
  }),
  z.object({
    type: z.literal("shift"),
    fromUke: z.number().int().min(1).max(53),
    weeks: z.number().int().min(1).max(20),
    at: z.string().max(40),
    note: z.string().max(300).optional()
  }),
  z.object({
    type: z.literal("reset"),
    at: z.string().max(40)
  })
]);

export const planStateSchema = z.object({
  version: z.literal(1),
  operations: z.array(planOperationSchema).max(500),
  updatedAt: z.string().max(40)
});

export type PlanOperation = z.infer<typeof planOperationSchema>;
export type PlanState = z.infer<typeof planStateSchema>;

export function emptyPlanState(now = new Date().toISOString()): PlanState {
  return { version: 1, operations: [], updatedAt: now };
}
