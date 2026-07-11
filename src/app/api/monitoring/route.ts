import { chatHistoryRepository } from "@/application/chat-history-container";
import { getUserSessionId } from "@/app/api/chat/user-session";

export const runtime = "nodejs";

export async function GET() {
  const userSessionId = await getUserSessionId();
  return Response.json({ items: await chatHistoryRepository.listMonitoring(userSessionId) });
}
