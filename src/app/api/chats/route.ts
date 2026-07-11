import { chatHistoryRepository } from "@/application/chat-history-container";
import { getUserSessionId } from "@/app/api/chat/user-session";

export const runtime = "nodejs";

export async function POST() {
  const userSessionId = await getUserSessionId();
  return Response.json(await chatHistoryRepository.createChat(userSessionId), { status: 201 });
}
