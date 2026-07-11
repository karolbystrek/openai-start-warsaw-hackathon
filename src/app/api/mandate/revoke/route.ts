import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";

export async function POST() {
  const state = await checkpointApplication.revokeMandate();
  return Response.json(SimulationStateSchema.parse(state));
}
