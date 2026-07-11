import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = SimulationStateSchema.parse(await checkpointApplication.getSimulationState());
  return Response.json(state);
}
