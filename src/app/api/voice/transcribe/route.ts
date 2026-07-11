import { getOpenAIVoiceService } from "@/ai/openai-voice";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/m4a",
  "audio/mp3",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
]);

export async function POST(request: Request) {
  const service = getOpenAIVoiceService();
  if (!service) {
    return Response.json(
      { error: "OpenAI transcription is not configured. Add OPENAI_API_KEY to enable it." },
      { status: 503 },
    );
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return Response.json({ error: "Attach a non-empty audio recording." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "The recording exceeds the 25 MB limit." }, { status: 413 });
  }
  const baseAudioType = audio.type.split(";", 1)[0];
  if (baseAudioType && !SUPPORTED_AUDIO_TYPES.has(baseAudioType)) {
    return Response.json({ error: "Use MP3, MP4, M4A, WAV, MPEG, or WebM audio." }, { status: 415 });
  }

  try {
    const text = await service.transcribe(audio);
    if (!text) {
      return Response.json({ error: "No speech was detected in the recording." }, { status: 422 });
    }
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("OpenAI transcription failed", error);
    return Response.json(
      { error: "The recording could not be transcribed. Try again in a quieter place." },
      { status: 502 },
    );
  }
}
