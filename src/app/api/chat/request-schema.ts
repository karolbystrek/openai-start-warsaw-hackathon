import { z } from "zod";

export const ChatRequestSchema = z.object({
  chatId: z.string().uuid(),
  messages: z.array(z.string().trim().min(1).max(2_000)).min(1).max(20),
  displayedUserContent: z.string().trim().min(1).max(2_000).optional(),
  persistAssistantMessage: z.boolean().optional().default(true),
});

export async function parseChatRequest(request: Request) {
  return ChatRequestSchema.safeParse(await request.json().catch(() => null));
}
