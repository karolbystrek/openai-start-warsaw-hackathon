import OpenAI from "openai";

export const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "marin",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "cedar",
] as const;

export type OpenAIVoice = (typeof OPENAI_VOICES)[number];

export class OpenAIVoiceService {
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    private readonly speechModel = process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
    private readonly transcriptionModel = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-mini-transcribe",
  ) {
    this.client = new OpenAI({ apiKey, maxRetries: 2, timeout: 30_000 });
  }

  async transcribe(file: File): Promise<string> {
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: this.transcriptionModel,
      response_format: "text",
      prompt: "A concise shopping brief. Preserve brand names, model names, sizes, currencies, prices, countries, seller restrictions, and auto-buy intent exactly.",
    });
    return transcription.trim();
  }

  synthesize(text: string, voice: OpenAIVoice): Promise<Response> {
    return this.client.audio.speech.create({
      model: this.speechModel,
      voice,
      input: text,
      ...(this.speechModel.startsWith("gpt-4o") ? {
        instructions: "Speak as a warm, trustworthy shopping assistant. Match the language of the input. Be natural, concise, and clear when reading numbers, prices, sizes, and currencies.",
      } : {}),
      response_format: "mp3",
      stream_format: "audio",
    });
  }
}

let voiceService: OpenAIVoiceService | undefined;

export function getOpenAIVoiceService(): OpenAIVoiceService | null {
  if (process.env.VOICE_INTAKE_ENABLED === "false") return null;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  voiceService ??= new OpenAIVoiceService(apiKey);
  return voiceService;
}
