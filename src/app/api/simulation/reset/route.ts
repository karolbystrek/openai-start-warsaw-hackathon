import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";

export async function POST() {
  const state = SimulationStateSchema.parse(await checkpointApplication.resetSimulation());
  return Response.json(state);
}
