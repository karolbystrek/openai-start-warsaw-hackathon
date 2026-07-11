import { z } from "zod";

import {
  getOpenAIVoiceService,
  OPENAI_VOICES,
} from "@/ai/openai-voice";

export const runtime = "nodejs";

const SpeechRequestSchema = z.object({
  text: z.string().trim().min(1).max(2_000),
  voice: z.enum(OPENAI_VOICES).default("marin"),
}).strict();

export async function POST(request: Request) {
  const service = getOpenAIVoiceService();
  if (!service) {
    return Response.json(
      { error: "OpenAI voice is not configured. Add OPENAI_API_KEY to enable it." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const command = SpeechRequestSchema.safeParse(body);
  if (!command.success) {
    return Response.json(
      { error: "Provide 1–2,000 characters and a supported OpenAI voice." },
      { status: 400 },
    );
  }

  try {
    const speech = await service.synthesize(command.data.text, command.data.voice);
    return new Response(speech.body, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "audio/mpeg",
        "X-AI-Generated-Audio": "true",
      },
    });
  } catch (error) {
    console.error("OpenAI speech generation failed", error);
    return Response.json(
      { error: "The OpenAI voice could not be generated. Try again." },
      { status: 502 },
    );
  }
}
