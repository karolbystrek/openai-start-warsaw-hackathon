import { z } from "zod";

import { checkpointApplication } from "@/application/container";
import { SimulationStateSchema } from "@/application/simulation-state";

export const runtime = "nodejs";

const MandateConfirmationSchema = z.object({
  minimumLandedCostMinor: z.number().int().safe().nonnegative(),
  maximumLandedCostMinor: z.number().int().safe().nonnegative(),
  requireLowStock: z.boolean(),
  allowedMerchantIds: z.array(z.string().trim().min(1)).optional(),
  confirmed: z.literal(true),
});

export async function POST(request: Request) {
  const command = MandateConfirmationSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json({ error: "Explicit confirmation and a valid mandate scope are required." }, { status: 400 });
  }
  try {
    const state = await checkpointApplication.confirmMandate({
      minimumLandedCostMinor: command.data.minimumLandedCostMinor,
      maximumLandedCostMinor: command.data.maximumLandedCostMinor,
      requireLowStock: command.data.requireLowStock,
      ...(command.data.allowedMerchantIds
        ? { allowedMerchantIds: command.data.allowedMerchantIds }
        : {}),
    });
    return Response.json(SimulationStateSchema.parse(state));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not activate the purchase mandate." },
      { status: 409 },
    );
  }
}
