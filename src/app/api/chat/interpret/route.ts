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

  const result = await shoppingChatApplication.interpret(command.data.messages);
  return Response.json(result);
}
