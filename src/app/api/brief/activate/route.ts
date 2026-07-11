import { z } from "zod";

import { checkpointApplication } from "@/application/container";

export const runtime = "nodejs";

const BriefCommandSchema = z.object({ sourceText: z.string().trim().min(1).max(2_000) });

export async function POST(request: Request) {
  const command = BriefCommandSchema.safeParse(await request.json().catch(() => null));
  if (!command.success) {
    return Response.json({ error: "Enter a shopping brief between 1 and 2,000 characters." }, { status: 400 });
  }
  const result = await checkpointApplication.activateBrief(command.data.sourceText);
  if (!result.state) {
    return Response.json({ interpretation: result.interpretation, error: "Resolve every blocking ambiguity before activation." }, { status: 422 });
  }
  return Response.json(result);
}
