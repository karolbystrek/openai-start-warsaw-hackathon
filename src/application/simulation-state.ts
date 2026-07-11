import { z } from "zod";

import {
  DecisionRecordSchema,
  MandateSchema,
  ShoppingRequestSchema,
  SimulatedOrderSchema,
  SimulationEventSchema,
} from "@/domain/contracts";

export const SimulationStateSchema = z.object({
  request: ShoppingRequestSchema,
  simulator: z.object({
    status: z.enum(["PLAYING", "PAUSED", "COMPLETE"]),
    speed: z.number().positive(),
    virtualTime: z.string(),
    nextSequence: z.number().int().nonnegative(),
    totalEvents: z.number().int().nonnegative(),
    currentEvent: SimulationEventSchema.nullable(),
  }),
  processedEvents: z.array(SimulationEventSchema),
  decisions: z.array(DecisionRecordSchema),
  currentDecision: DecisionRecordSchema.nullable(),
  mandate: MandateSchema.nullable(),
  order: SimulatedOrderSchema.nullable(),
  receipt: z.object({ concise: z.string(), expanded: z.array(z.string()) }).nullable(),
});

export type SimulationState = z.infer<typeof SimulationStateSchema>;
