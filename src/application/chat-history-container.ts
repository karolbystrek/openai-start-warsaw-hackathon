import { ChatHistoryRepository } from "@/application/chat-history";
import { createDatabase } from "@/db/client";

const historyGlobal = globalThis as typeof globalThis & {
  chatHistoryRepository?: ChatHistoryRepository;
};

export const chatHistoryRepository = historyGlobal.chatHistoryRepository
  ?? new ChatHistoryRepository(createDatabase().db);

if (process.env.NODE_ENV !== "production") {
  historyGlobal.chatHistoryRepository = chatHistoryRepository;
}
