import { and, asc, desc, eq } from "drizzle-orm";

import type { ChatInterpretationResult } from "@/application/chat-application";
import type { ShoppingDatabase } from "@/db/client";
import { chatMessages, chatMonitoringRequests, chats, requestVersions } from "@/db/schema";
import { ShoppingRequestSchema, type ShoppingRequest } from "@/domain/contracts";

export type PersistedChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type PersistedChatState = {
  interpretation: ChatInterpretationResult | null;
  confirmedRequest: ShoppingRequest | null;
  userTurns: string[];
};

export type PersistedChat = {
  id: string;
  title: string;
  messages: PersistedChatMessage[];
  state: PersistedChatState;
  createdAt: string;
  updatedAt: string;
};

export type MonitoringListItem = {
  chatId: string;
  requestId: string;
  title: string;
  variant: string | null;
  lifecycle: ShoppingRequest["lifecycle"];
  maximumLandedCost: ShoppingRequest["requirements"]["maximumLandedCost"];
  createdAt: string;
  updatedAt: string;
};

const emptyState: PersistedChatState = {
  interpretation: null,
  confirmedRequest: null,
  userTurns: [],
};

export class ChatHistoryRepository {
  constructor(private readonly db: ShoppingDatabase) {}

  async createChat(userSessionId: string): Promise<PersistedChat> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    await this.db.insert(chats).values({
      id,
      userSessionId,
      title: "New shopping request",
      statePayload: JSON.stringify(emptyState),
      createdAt: now,
      updatedAt: now,
    });
    return { id, title: "New shopping request", messages: [], state: emptyState, createdAt: now, updatedAt: now };
  }

  async getChat(id: string, userSessionId: string): Promise<PersistedChat | null> {
    const row = await this.db.query.chats.findFirst({
      where: and(eq(chats.id, id), eq(chats.userSessionId, userSessionId)),
    });
    if (!row) return null;
    const messages = await this.db.select().from(chatMessages)
      .where(eq(chatMessages.chatId, id))
      .orderBy(asc(chatMessages.createdAt));
    return {
      id: row.id,
      title: row.title,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      })),
      state: this.parseState(row.statePayload),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  async saveInteraction(input: {
    chatId: string;
    userSessionId: string;
    userContent: string;
    assistantContent: string;
    state: PersistedChatState;
  }): Promise<boolean> {
    const chat = await this.getOwnedChatRow(input.chatId, input.userSessionId);
    if (!chat) return false;
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.insert(chatMessages).values([
        { id: crypto.randomUUID(), chatId: input.chatId, role: "user", content: input.userContent, createdAt: now },
        { id: crypto.randomUUID(), chatId: input.chatId, role: "assistant", content: input.assistantContent, createdAt: now },
      ]).run();
      tx.update(chats).set({
        title: chat.title === "New shopping request" ? this.titleFrom(input.userContent) : chat.title,
        statePayload: JSON.stringify(input.state),
        updatedAt: now,
      }).where(eq(chats.id, input.chatId)).run();
    });
    return true;
  }

  async saveAssistantMessage(input: {
    chatId: string;
    userSessionId: string;
    content: string;
    state: PersistedChatState;
  }): Promise<boolean> {
    const chat = await this.getOwnedChatRow(input.chatId, input.userSessionId);
    if (!chat) return false;
    const now = new Date().toISOString();
    this.db.transaction((tx) => {
      tx.insert(chatMessages).values({
        id: crypto.randomUUID(), chatId: input.chatId, role: "assistant", content: input.content, createdAt: now,
      }).run();
      tx.update(chats).set({ statePayload: JSON.stringify(input.state), updatedAt: now })
        .where(eq(chats.id, input.chatId)).run();
    });
    return true;
  }

  async linkMonitoringRequest(input: {
    chatId: string;
    userSessionId: string;
    request: ShoppingRequest;
  }): Promise<boolean> {
    const chat = await this.getOwnedChatRow(input.chatId, input.userSessionId);
    if (!chat) return false;
    await this.db.insert(chatMonitoringRequests).values({
      chatId: input.chatId,
      requestId: input.request.id,
      requestVersion: input.request.version,
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing();
    return true;
  }

  async listMonitoring(userSessionId: string): Promise<MonitoringListItem[]> {
    const links = await this.db.select({
      chatId: chatMonitoringRequests.chatId,
      requestId: chatMonitoringRequests.requestId,
      requestVersion: chatMonitoringRequests.requestVersion,
      createdAt: chatMonitoringRequests.createdAt,
      updatedAt: chats.updatedAt,
    }).from(chatMonitoringRequests)
      .innerJoin(chats, eq(chats.id, chatMonitoringRequests.chatId))
      .where(eq(chats.userSessionId, userSessionId))
      .orderBy(desc(chats.updatedAt));

    const items = await Promise.all(links.map(async (link): Promise<MonitoringListItem | null> => {
      const requestRow = await this.db.query.requestVersions.findFirst({
        where: eq(requestVersions.id, link.requestId),
        orderBy: desc(requestVersions.version),
      });
      if (!requestRow) return null;
      const request = ShoppingRequestSchema.parse(JSON.parse(requestRow.payload));
      return {
        chatId: link.chatId,
        requestId: request.id,
        title: [request.product.brand, request.product.model].filter(Boolean).join(" "),
        variant: request.requirements.size ?? null,
        lifecycle: request.lifecycle,
        maximumLandedCost: request.requirements.maximumLandedCost,
        createdAt: link.createdAt,
        updatedAt: link.updatedAt,
      };
    }));
    return items.filter((item): item is MonitoringListItem => item !== null);
  }

  private async getOwnedChatRow(id: string, userSessionId: string) {
    return this.db.query.chats.findFirst({
      where: and(eq(chats.id, id), eq(chats.userSessionId, userSessionId)),
    });
  }

  private parseState(payload: string): PersistedChatState {
    try {
      const value = JSON.parse(payload) as PersistedChatState;
      return {
        interpretation: value.interpretation ?? null,
        confirmedRequest: value.confirmedRequest ? ShoppingRequestSchema.parse(value.confirmedRequest) : null,
        userTurns: Array.isArray(value.userTurns) ? value.userTurns.filter((turn): turn is string => typeof turn === "string") : [],
      };
    } catch {
      return emptyState;
    }
  }

  private titleFrom(content: string): string {
    const compact = content.replace(/\s+/g, " ").trim();
    return compact.length > 64 ? `${compact.slice(0, 61)}…` : compact;
  }
}
