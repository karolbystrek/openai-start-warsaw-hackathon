import { z } from "zod";

import { checkpointApplication } from "@/application/container";
import { ShoppingBriefInterpretationSchema } from "@/domain/contracts";

export const runtime = "nodejs";

const BriefCommandSchema = z.object({ sourceText: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request) {
  const command = BriefCommandSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json({ error: "Enter a shopping brief between 1 and 2,000 characters." }, { status: 400 });
  }
  const interpretation = ShoppingBriefInterpretationSchema.parse(
    await checkpointApplication.interpretBrief(command.data.sourceText),
  );
  return Response.json(interpretation);
}
