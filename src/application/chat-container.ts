import { OpenAIBriefInterpreter } from "@/ai/openai-brief-interpreter";
import { ResilientBriefInterpreter } from "@/ai/resilient-brief-interpreter";
import { ShoppingChatApplication } from "@/application/chat-application";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import {
  ConfirmedShoppingRequestProjector,
  DeterministicBriefInterpreter,
} from "@/domain/brief/interpret";

function createLiveInterpreter() {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return undefined;
  return new OpenAIBriefInterpreter();
}

function createShoppingChatApplication(): ShoppingChatApplication {
  const { db } = createDatabase();
  const interpreter = new ResilientBriefInterpreter(
    new DeterministicBriefInterpreter(),
    createLiveInterpreter(),
  );
  return new ShoppingChatApplication(
    interpreter,
    new ConfirmedShoppingRequestProjector(),
    new DrizzleCheckpointRepository(db),
  );
}

const chatGlobal = globalThis as typeof globalThis & {
  shoppingChatApplication?: ShoppingChatApplication;
};

export const shoppingChatApplication = chatGlobal.shoppingChatApplication
  ?? createShoppingChatApplication();

if (process.env.NODE_ENV !== "production") {
  chatGlobal.shoppingChatApplication = shoppingChatApplication;
}
