import { z } from "zod";

import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";

const StepCommandSchema = z.object({
  expectedSequence: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const command = StepCommandSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json(
      { error: "A non-negative expectedSequence is required." },
      { status: 400 },
    );
  }

  const state = SimulationStateSchema.parse(
    await checkpointApplication.stepSimulation(command.data.expectedSequence),
  );
  return Response.json(state);
}
