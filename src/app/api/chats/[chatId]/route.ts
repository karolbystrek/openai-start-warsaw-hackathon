import { chatHistoryRepository } from "@/application/chat-history-container";
import { getUserSessionId } from "@/app/api/chat/user-session";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ chatId: string }> }) {
  const [{ chatId }, userSessionId] = await Promise.all([context.params, getUserSessionId()]);
  const chat = await chatHistoryRepository.getChat(chatId, userSessionId);
  return chat
    ? Response.json(chat)
    : Response.json({ error: "Chat not found." }, { status: 404 });
}
