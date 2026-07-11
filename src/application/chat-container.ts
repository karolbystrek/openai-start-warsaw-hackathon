import { OpenAIBriefInterpreter } from "@/ai/openai-brief-interpreter";
import { ResilientBriefInterpreter } from "@/ai/resilient-brief-interpreter";
import {
  ShoppingChatApplication,
  type MonitoringActivationPort,
  type MonitoringActivationStatus,
} from "@/application/chat-application";
import { checkpointApplication } from "@/application/container";
import { createDatabase } from "@/db/client";
import { DrizzleCheckpointRepository } from "@/db/repositories/drizzle-checkpoint-repository";
import {
  ConfirmedShoppingRequestProjector,
  DeterministicBriefInterpreter,
} from "@/domain/brief/interpret";
import type { ShoppingRequest } from "@/domain/contracts";

class CheckpointMonitoringActivation implements MonitoringActivationPort {
  async requestActivated(request: ShoppingRequest): Promise<MonitoringActivationStatus> {
    await checkpointApplication.activateRequest(request);
    return "ACTIVE";
  }
}

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
    new CheckpointMonitoringActivation(),
  );
}

const chatGlobal = globalThis as typeof globalThis & {
  shoppingChatApplication?: ShoppingChatApplication;
  shoppingChatApplicationVersion?: number;
};

const SHOPPING_CHAT_APPLICATION_VERSION = 3;
export const shoppingChatApplication = chatGlobal.shoppingChatApplication
  && chatGlobal.shoppingChatApplicationVersion === SHOPPING_CHAT_APPLICATION_VERSION
  ? chatGlobal.shoppingChatApplication
  : createShoppingChatApplication();

if (process.env.NODE_ENV !== "production") {
  chatGlobal.shoppingChatApplication = shoppingChatApplication;
  chatGlobal.shoppingChatApplicationVersion = SHOPPING_CHAT_APPLICATION_VERSION;
}
