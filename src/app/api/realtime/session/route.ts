import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1-mini";

export async function POST() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Voice intake is unavailable because the OpenAI API key is not configured." },
      { status: 503 },
    );
  }

  const model = process.env.OPENAI_REALTIME_MODEL ?? DEFAULT_REALTIME_MODEL;

  try {
    const client = new OpenAI({ apiKey });
    const secret = await client.realtime.clientSecrets.create({
      expires_after: { anchor: "created_at", seconds: 60 },
      session: { type: "realtime", model },
    });

    return Response.json(
      { clientSecret: secret.value, expiresAt: secret.expires_at, model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Could not start the voice session. Try again in a moment." },
      { status: 502 },
    );
  }
}
