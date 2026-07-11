import { ShoppingChatApplication } from "@/application/chat-application";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import {
  ConfirmedShoppingRequestProjector,
  DeterministicBriefInterpreter,
} from "@/domain/brief/interpret";

function createShoppingChatApplication(): ShoppingChatApplication {
  const { db } = createDatabase();
  const interpreter = new DeterministicBriefInterpreter();
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
