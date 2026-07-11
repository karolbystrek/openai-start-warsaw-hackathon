import { checkpointApplication } from "@/application/container";
import { parseChatRequest } from "@/app/api/chat/request-schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const command = await parseChatRequest(request);
  if (!command.success) {
    return Response.json(
      { error: "Provide between 1 and 20 non-empty user messages." },
      { status: 400 },
    );
  }

  const result = await checkpointApplication.activateBrief(command.data.messages.join("\n"));
  const activeRequest = result.state?.request ?? null;
  return Response.json({
    interpretation: result.interpretation,
    requestDraft: activeRequest,
    canConfirm: activeRequest !== null,
    confirmed: activeRequest !== null,
    request: activeRequest,
    monitoring: activeRequest ? "ACTIVE" : "DEFERRED",
  });
}
