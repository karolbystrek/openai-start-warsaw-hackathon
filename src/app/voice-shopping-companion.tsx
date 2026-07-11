"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeSession,
  tool,
  type RealtimeItem,
} from "@openai/agents/realtime";
import { z } from "zod";

export type VoiceBriefReview = {
  complete: boolean;
  missingQuestions: string[];
  summary: string;
};

type VoiceShoppingCompanionProps = {
  disabled?: boolean;
  onBriefReview: (brief: string) => Promise<VoiceBriefReview>;
};

type VoicePhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";

type SessionTokenResponse = {
  clientSecret: string;
  expiresAt: number;
  model: string;
  error?: string;
};

const phaseLabel: Record<VoicePhase, string> = {
  idle: "Resting",
  connecting: "Waking up",
  listening: "Listening",
  thinking: "Checking your brief",
  speaking: "Speaking",
  error: "Needs attention",
};

const latestAssistantTranscript = (history: RealtimeItem[]) => {
  for (const item of [...history].reverse()) {
    if (item.type !== "message" || item.role !== "assistant") continue;
    for (const content of [...item.content].reverse()) {
      if (content.type === "output_audio" && content.transcript?.trim()) return content.transcript.trim();
      if (content.type === "output_text" && content.text.trim()) return content.text.trim();
    }
  }
  return null;
};

async function readTokenResponse(response: Response): Promise<SessionTokenResponse> {
  const payload = await response.json() as SessionTokenResponse;
  if (!response.ok || !payload.clientSecret) {
    throw new Error(payload.error ?? "Could not create a voice session.");
  }
  return payload;
}

export function VoiceShoppingCompanion({
  disabled = false,
  onBriefReview,
}: VoiceShoppingCompanionProps) {
  const sessionRef = useRef<RealtimeSession | null>(null);
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [briefReady, setBriefReady] = useState(false);
  const [missingQuestions, setMissingQuestions] = useState<string[]>([]);
  const [transcript, setTranscript] = useState("Call Scout when you want to talk through your search.");
  const [error, setError] = useState<string | null>(null);

  const stopVoice = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    setConnected(false);
    setMuted(false);
    setPhase("idle");
  }, []);

  const startVoice = useCallback(async () => {
    if (disabled || sessionRef.current || phase === "connecting") return;
    setError(null);
    setBriefReady(false);
    setMissingQuestions([]);
    setPhase("connecting");

    try {
      const token = await readTokenResponse(await fetch("/api/realtime/session", { method: "POST" }));

      const reviewBrief = tool({
        name: "review_shopping_brief",
        description: "Submit the complete cumulative shopping brief whenever the user adds or changes a preference. The backend returns the exact missing questions or marks the brief ready for explicit UI confirmation.",
        parameters: z.object({
          brief: z.string().min(3).max(2_000).describe("A concise cumulative brief containing every product requirement and preference stated so far."),
        }),
        execute: async ({ brief }) => {
          setPhase("thinking");
          const review = await onBriefReview(brief);
          setBriefReady(review.complete);
          setMissingQuestions(review.missingQuestions);
          return JSON.stringify({
            status: review.complete ? "READY_FOR_UI_CONFIRMATION" : "NEEDS_CLARIFICATION",
            missingQuestions: review.missingQuestions,
            summary: review.summary,
            nextAction: review.complete
              ? "Tell the user to review the card and click Confirm hard requirements. Do not confirm for them."
              : "Ask only the first missing question, then call this tool again with the updated cumulative brief.",
          });
        },
        errorFunction: () => "The brief checker is temporarily unavailable. Ask the user to continue in the text box.",
      });

      const agent = new RealtimeAgent({
        name: "Scout",
        voice: "marin",
        instructions: [
          "You are Scout, a warm and concise shopping companion.",
          "Help the user build a precise product search before any matching or monitoring begins.",
          "Collect an exact brand and model, applicable size or variant, acceptable condition, delivery country, maximum delivered price with currency, and whether trusted resellers or marketplaces are allowed.",
          "Treat optional attributes such as color as preferences unless the user says they are mandatory.",
          "Ask one short question at a time and acknowledge facts already supplied.",
          "After every meaningful user answer, call review_shopping_brief with the complete cumulative brief, not only the latest answer.",
          "Use the tool result as authoritative. Never invent missing facts, relax a cap, confirm the request, start monitoring, or authorize a purchase.",
          "When the tool says READY_FOR_UI_CONFIRMATION, ask the user to review the card and click the confirmation button.",
        ].join(" "),
        tools: [reviewBrief],
      });

      const session = new RealtimeSession(agent, {
        model: token.model,
        config: {
          outputModalities: ["audio"],
          reasoning: { effort: "low" },
          audio: {
            input: {
              noiseReduction: { type: "near_field" },
              transcription: { model: "gpt-4o-mini-transcribe" },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "medium",
                createResponse: true,
                interruptResponse: true,
              },
            },
            output: { voice: "marin" },
          },
        },
        tracingDisabled: true,
      });

      session.on("agent_start", () => setPhase("thinking"));
      session.on("agent_tool_start", () => setPhase("thinking"));
      session.on("audio_start", () => setPhase("speaking"));
      session.on("audio_stopped", () => setPhase("listening"));
      session.on("audio_interrupted", () => setPhase("listening"));
      session.on("history_updated", (history) => {
        const latest = latestAssistantTranscript(history);
        if (latest) setTranscript(latest);
      });
      session.on("error", () => {
        setError("The voice connection was interrupted. You can reconnect or keep typing.");
        setPhase("error");
      });

      await session.connect({ apiKey: token.clientSecret });
      sessionRef.current = session;
      setConnected(true);
      setPhase("listening");
      session.sendMessage("Welcome the user briefly, introduce yourself as Scout, and ask what product they want you to hunt for.");
    } catch (cause) {
      sessionRef.current?.close();
      sessionRef.current = null;
      setConnected(false);
      setError(cause instanceof Error ? cause.message : "Could not start voice intake.");
      setPhase("error");
    }
  }, [disabled, onBriefReview, phase]);

  const toggleMute = () => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !muted;
    session.mute(next);
    setMuted(next);
  };

  useEffect(() => {
    const summon = () => void startVoice();
    const summonWithKeyboard = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        summon();
      }
    };
    window.addEventListener("shopping-voice-summon", summon);
    window.addEventListener("keydown", summonWithKeyboard);
    return () => {
      window.removeEventListener("shopping-voice-summon", summon);
      window.removeEventListener("keydown", summonWithKeyboard);
    };
  }, [startVoice]);

  useEffect(() => () => sessionRef.current?.close(), []);

  return (
    <section className={`voice-companion voice-${phase}`} aria-label="Scout voice shopping companion">
      <div className="scout-stage" aria-hidden="true">
        <span className="scout-spark spark-one" />
        <span className="scout-spark spark-two" />
        <div className="scout-shadow" />
        <div className="scout-pet">
          <span className="scout-ear ear-left" />
          <span className="scout-ear ear-right" />
          <div className="scout-face">
            <span className="scout-eye eye-left" />
            <span className="scout-eye eye-right" />
            <span className="scout-mouth" />
          </div>
          <span className="scout-badge">S</span>
        </div>
      </div>

      <div className="scout-copy">
        <div className="scout-title-row">
          <div>
            <p className="card-label">Voice companion</p>
            <h3>Scout</h3>
          </div>
          <span className={`voice-state ${briefReady ? "ready" : phase}`}>{briefReady ? "Brief ready" : phaseLabel[phase]}</span>
        </div>
        <p className="scout-transcript" aria-live="polite">“{transcript}”</p>
        {missingQuestions.length > 0 ? (
          <p className="scout-next"><strong>Next:</strong> {missingQuestions[0]}</p>
        ) : null}
        {error ? <p className="voice-error" role="alert">{error}</p> : null}
      </div>

      <div className="voice-actions">
        {connected ? (
          <>
            <button type="button" className="voice-secondary" onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
            <button type="button" className="voice-primary stop" onClick={stopVoice}>End call</button>
          </>
        ) : (
          <button type="button" className="voice-primary" onClick={() => void startVoice()} disabled={disabled || phase === "connecting"}>
            {phase === "connecting" ? "Calling…" : phase === "error" ? "Try again" : "Call Scout"}
          </button>
        )}
        <small>Alt+V · or type /voice</small>
      </div>
    </section>
  );
}
