import { chatAssistantSummary } from "@/application/chat-application";
import { shoppingChatApplication } from "@/application/chat-container";
import { chatHistoryRepository } from "@/application/chat-history-container";
import { parseChatRequest } from "@/app/api/chat/request-schema";
import { getUserSessionId } from "@/app/api/chat/user-session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const command = await parseChatRequest(request);
  if (!command.success) {
    return Response.json(
      { error: "Provide between 1 and 20 non-empty user messages." },
      { status: 400 },
    );
  }

  const userSessionId = await getUserSessionId();
  const result = await shoppingChatApplication.interpret(command.data.messages);
  const saved = await chatHistoryRepository.saveInteraction({
    chatId: command.data.chatId,
    userSessionId,
    userContent: command.data.messages.at(-1)!,
    assistantContent: chatAssistantSummary(result),
    state: {
      interpretation: result,
      confirmedRequest: null,
      userTurns: command.data.messages,
    },
  });
  if (!saved) return Response.json({ error: "Chat not found." }, { status: 404 });
  return Response.json(result);
}
