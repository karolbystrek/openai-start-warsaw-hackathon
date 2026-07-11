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

  try {
    const userSessionId = await getUserSessionId();
    const result = await shoppingChatApplication.confirm(command.data.messages);
    if (result.confirmed && result.request) {
      const assistantContent = result.monitoring === "ACTIVE"
        ? "Request confirmed. Monitoring is active and ready for merchant events."
        : "Request confirmed and saved. Monitoring activation is still pending.";
      const owned = await chatHistoryRepository.linkMonitoringRequest({
        chatId: command.data.chatId,
        userSessionId,
        request: result.request,
      });
      if (!owned) return Response.json({ error: "Chat not found." }, { status: 404 });
      await chatHistoryRepository.saveAssistantMessage({
        chatId: command.data.chatId,
        userSessionId,
        content: assistantContent,
        state: {
          interpretation: result,
          confirmedRequest: result.request,
          userTurns: command.data.messages,
        },
      });
    } else {
      const owned = await chatHistoryRepository.saveAssistantMessage({
        chatId: command.data.chatId,
        userSessionId,
        content: chatAssistantSummary(result),
        state: {
          interpretation: result,
          confirmedRequest: null,
          userTurns: command.data.messages,
        },
      });
      if (!owned) return Response.json({ error: "Chat not found." }, { status: 404 });
    }
    return Response.json(result);
  } catch (error) {
    console.error("Could not confirm the shopping brief.", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not confirm the shopping brief." },
      { status: 500 },
    );
  }
}
