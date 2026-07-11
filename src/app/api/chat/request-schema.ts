import { z } from "zod";

export const ChatRequestSchema = z.object({
  messages: z.array(z.string().trim().min(1).max(2_000)).min(1).max(20),
});

export async function parseChatRequest(request: Request) {
  return ChatRequestSchema.safeParse(await request.json().catch(() => null));
}
