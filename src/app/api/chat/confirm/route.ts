import { shoppingChatApplication } from "@/application/chat-container";
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

  try {
    const result = await shoppingChatApplication.confirm(command.data.messages);
    return Response.json(result);
  } catch (error) {
    console.error("Could not confirm the shopping brief.", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not confirm the shopping brief." },
      { status: 500 },
    );
  }
}
