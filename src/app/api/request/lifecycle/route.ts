import { z } from "zod";

import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";

const RequestLifecycleCommandSchema = z.object({
  action: z.enum(["PAUSE", "RESUME", "REVOKE"]),
});

export async function POST(request: Request) {
  const command = RequestLifecycleCommandSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json({ error: "A valid request lifecycle action is required." }, { status: 400 });
  }
  try {
    const state = await checkpointApplication.changeRequestLifecycle(command.data.action);
    return Response.json(SimulationStateSchema.parse(state));
  } catch (error) {
    console.error("Could not update the shopping request lifecycle.", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not update the shopping request." },
      { status: 500 },
    );
  }
}
