import { z } from "zod";

import { checkpointApplication } from "@/application/container";

export const runtime = "nodejs";

const PaymentCommandSchema = z.object({
  decisionId: z.string().min(1),
  explicitConsent: z.literal(true),
});

export async function POST(request: Request) {
  const command = PaymentCommandSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json(
      { error: "Explicit one-time checkout confirmation is required." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await checkpointApplication.placeSimulatedPayment(command.data.decisionId));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Simulated payment could not be completed." },
      { status: 409 },
    );
  }
}
