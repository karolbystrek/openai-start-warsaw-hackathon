"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/app/format-money";
import type {
  ShoppingBriefInterpretation,
  ShoppingRequest,
} from "@/domain/contracts";
import { presentationProducts } from "@/domain/catalog/presentation-products";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type InterpretationResponse = {
  interpretation: ShoppingBriefInterpretation;
  requestDraft: ShoppingRequest | null;
  canConfirm: boolean;
};

type ConfirmationResponse = InterpretationResponse & {
  confirmed: boolean;
  request: ShoppingRequest | null;
  monitoring: "ACTIVE" | "DEFERRED";
};

type VoiceName = "marin" | "cedar" | "coral";

type TranscriptionResponse = {
  text: string;
};

type ShoppingChatProps = {
  voiceEnabled: boolean;
};

const VOICE_OPTIONS: ReadonlyArray<{ value: VoiceName; label: string }> = [
  { value: "marin", label: "Marin · warm" },
  { value: "cedar", label: "Cedar · grounded" },
  { value: "coral", label: "Coral · bright" },
];

const initialMessages: ChatMessage[] = [{
  id: "welcome",
  role: "assistant",
  content: "Tell me what you want to buy. I’ll separate hard requirements from preferences and flag anything that needs clarification.",
}];

function assistantSummary(result: InterpretationResponse): string {
  if (result.interpretation.ambiguities.length > 0) {
    const count = result.interpretation.ambiguities.length;
    return `I have a partial brief, but ${count} ${count === 1 ? "detail is" : "details are"} still required before monitoring can start.`;
  }
  return "The brief is complete. Review the hard constraints below and confirm them before monitoring is activated.";
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The shopping assistant request failed.");
  return payload;
}

function preferredRecordingType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
    .find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function ShoppingChat({ voiceEnabled }: ShoppingChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [userTurns, setUserTurns] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [interpretation, setInterpretation] = useState<InterpretationResponse | null>(null);
  const [confirmedRequest, setConfirmedRequest] = useState<ShoppingRequest | null>(null);
  const [pending, setPending] = useState<"interpret" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voice, setVoice] = useState<VoiceName>("marin");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const discardRecordingRef = useRef(false);

  const stopAudio = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setSpeakingMessageId(null);
  };

  useEffect(() => () => {
    discardRecordingRef.current = true;
    audioRef.current?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const speakMessage = async (message: ChatMessage) => {
    if (!voiceEnabled || message.role !== "assistant") return;
    if (speakingMessageId === message.id) {
      stopAudio();
      return;
    }

    stopAudio();
    setVoiceError(null);
    setSpeakingMessageId(message.id);
    try {
      const response = await fetch("/api/voice/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: message.content, voice }),
      });
      if (!response.ok) await readResponse<never>(response);
      const audioUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audioUrlRef.current = audioUrl;
      audio.addEventListener("ended", stopAudio, { once: true });
      audio.addEventListener("error", () => {
        setVoiceError("The generated voice could not be played in this browser.");
        stopAudio();
      }, { once: true });
      await audio.play();
    } catch (cause) {
      stopAudio();
      setVoiceError(cause instanceof Error ? cause.message : "Could not generate the OpenAI voice.");
    }
  };

  const appendAssistantMessage = (content: string) => {
    const message: ChatMessage = {
      id: `assistant-${crypto.randomUUID()}`,
      role: "assistant",
      content,
    };
    setMessages((current) => [...current, message]);
    if (autoSpeak && voiceEnabled) void speakMessage(message);
  };

  const transcribeRecording = async (recordingBlob: Blob) => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
    if (recordingBlob.size === 0) return;

    setTranscribing(true);
    setVoiceError(null);
    try {
      const extension = recordingBlob.type.includes("mp4") ? "mp4" : "webm";
      const form = new FormData();
      form.append("audio", new File([recordingBlob], `shopping-brief.${extension}`, {
        type: recordingBlob.type || "audio/webm",
      }));
      const response = await fetch("/api/voice/transcribe", { method: "POST", body: form });
      const result = await readResponse<TranscriptionResponse>(response);
      setInput((current) => [current.trim(), result.text.trim()].filter(Boolean).join(" "));
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (cause) {
      setVoiceError(cause instanceof Error ? cause.message : "Could not transcribe the recording.");
    } finally {
      setTranscribing(false);
    }
  };

  const stopRecording = () => {
    if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const startRecording = async () => {
    if (!voiceEnabled || recording || transcribing || pending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Microphone recording is not supported in this browser.");
      return;
    }

    setVoiceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = preferredRecordingType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        if (recordingTimeoutRef.current) clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current = null;
        const blob = new Blob(recordingChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recordingChunksRef.current = [];
        if (discardRecordingRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        void transcribeRecording(blob);
      }, { once: true });
      discardRecordingRef.current = false;
      recorder.start();
      setRecording(true);
      recordingTimeoutRef.current = setTimeout(stopRecording, 60_000);
    } catch (cause) {
      recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordingStreamRef.current = null;
      recorderRef.current = null;
      setRecording(false);
      setVoiceError(cause instanceof Error && cause.name === "NotAllowedError"
        ? "Microphone access was denied. Allow it in the browser to dictate a brief."
        : "The microphone could not be started.");
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;

    const nextTurns = [...userTurns, content];
    setUserTurns(nextTurns);
    setMessages((current) => [...current, {
      id: `user-${crypto.randomUUID()}`,
      role: "user",
      content,
    }]);
    setInput("");
    setError(null);
    setConfirmedRequest(null);
    setPending("interpret");

    try {
      const response = await fetch("/api/chat/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextTurns }),
      });
      const result = await readResponse<InterpretationResponse>(response);
      setInterpretation(result);
      appendAssistantMessage(assistantSummary(result));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not interpret the brief.");
    } finally {
      setPending(null);
    }
  };

  const confirmRequest = async () => {
    if (!interpretation?.canConfirm || userTurns.length === 0 || pending) return;
    setError(null);
    setPending("confirm");
    try {
      const response = await fetch("/api/chat/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: userTurns }),
      });
      const result = await readResponse<ConfirmationResponse>(response);
      setInterpretation(result);
      if (!result.confirmed || !result.request) {
        appendAssistantMessage(assistantSummary(result));
        return;
      }
      setConfirmedRequest(result.request);
      appendAssistantMessage("Request confirmed. The matching presentation scenario is active and ready for its first merchant event.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the brief.");
    } finally {
      setPending(null);
    }
  };

  const resetChat = () => {
    stopAudio();
    setMessages(initialMessages);
    setUserTurns([]);
    setInput("");
    setInterpretation(null);
    setConfirmedRequest(null);
    setError(null);
    setVoiceError(null);
  };

  const draft = interpretation?.interpretation.requestDraft;
  const budget = draft?.requirements.maximumLandedCost;

  return (
    <section className="chat-section" aria-labelledby="chat-title">
      <div className="chat-heading">
        <div>
          <p className="eyebrow">Request intake</p>
          <h2 id="chat-title">Start with a conversation</h2>
          <p>Confirm the brief first. Merchant events stay isolated until the request is complete.</p>
        </div>
        <span className="connector-status"><i /> Event connector ready</span>
      </div>

      <div className="chat-layout">
        <div className="chat-panel">
          <div className="chat-messages" aria-live="polite">
            {messages.map((message) => (
              <div className={`chat-message ${message.role}`} key={message.id}>
                <div className="message-meta">
                  <span>{message.role === "assistant" ? "Assistant" : "You"}</span>
                  {message.role === "assistant" && voiceEnabled ? (
                    <button
                      type="button"
                      className="listen-button"
                      onClick={() => void speakMessage(message)}
                      aria-label={speakingMessageId === message.id ? "Stop assistant voice" : "Read assistant message aloud"}
                    >
                      {speakingMessageId === message.id ? "Stop" : "Listen"}
                    </button>
                  ) : null}
                </div>
                <p>{message.content}</p>
              </div>
            ))}
            {pending === "interpret" ? (
              <div className="chat-message assistant thinking">
                <span>Assistant</span><p>Structuring your requirements…</p>
              </div>
            ) : null}
          </div>

          <form className="chat-composer" onSubmit={sendMessage}>
            <label htmlFor="shopping-message">Your shopping brief or clarification</label>
            <textarea
              id="shopping-message"
              ref={inputRef}
              maxLength={2_000}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Describe Nike Dunk Low, an Aalto vase, or a MacBook Air…"
              rows={3}
              value={input}
            />
            <div className="demo-briefs" aria-label="Presentation examples">
              <span>Try:</span>
              {presentationProducts.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setInput(profile.brief)}
                  disabled={pending !== null || recording || transcribing}
                >
                  {profile.label}
                </button>
              ))}
            </div>
            <div className="voice-tools" aria-label="OpenAI voice controls">
              <button
                type="button"
                className={`record-button ${recording ? "recording" : ""}`}
                onClick={recording ? stopRecording : () => void startRecording()}
                disabled={!voiceEnabled || transcribing || pending !== null}
              >
                <i aria-hidden="true" />
                {recording ? "Stop recording" : transcribing ? "Transcribing…" : "Dictate brief"}
              </button>
              <label className="voice-select">
                Voice
                <select
                  value={voice}
                  onChange={(event) => setVoice(event.target.value as VoiceName)}
                  disabled={!voiceEnabled || speakingMessageId !== null}
                >
                  {VOICE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="auto-speak">
                <input
                  type="checkbox"
                  checked={autoSpeak}
                  onChange={(event) => setAutoSpeak(event.target.checked)}
                  disabled={!voiceEnabled}
                />
                Auto-read replies
              </label>
            </div>
            <p className={`voice-disclosure ${voiceEnabled ? "" : "unavailable"}`}>
              {voiceEnabled
                ? "Voice input and AI-generated speech are provided by OpenAI. Dictation is inserted for review before sending."
                : "Voice is disabled. Enable VOICE_INTAKE_ENABLED and add OPENAI_API_KEY on the server to use OpenAI audio."}
            </p>
            <div className="composer-actions">
              <small>Three curated presentation products</small>
              <div>
                <button className="text-button" type="button" onClick={resetChat} disabled={pending !== null || recording || transcribing}>Clear</button>
                <button className="send-button" type="submit" disabled={!input.trim() || pending !== null || recording || transcribing}>
                  {pending === "interpret" ? "Reading…" : "Send"}
                </button>
              </div>
            </div>
          </form>
          {error ? <p className="chat-error" role="alert">{error}</p> : null}
          {voiceError ? <p className="chat-error voice" role="alert">{voiceError}</p> : null}
        </div>

        <aside className="brief-review" aria-label="Interpreted shopping brief">
          <div className="review-header">
            <div>
              <p className="card-label">Live interpretation</p>
              <h3>{draft?.product.brand ?? "Waiting"} {draft?.product.model ?? "for your brief"}</h3>
            </div>
            <span className={`review-state ${confirmedRequest ? "active" : interpretation?.canConfirm ? "ready" : "draft"}`}>
              {confirmedRequest ? "Active" : interpretation?.canConfirm ? "Ready" : "Draft"}
            </span>
          </div>

          {draft ? (
            <dl className="brief-facts">
              <div><dt>Required variant</dt><dd>{draft.requirements.size ?? "Unknown"}</dd></div>
              <div><dt>Condition</dt><dd>{draft.requirements.condition ?? "Unknown"}</dd></div>
              <div><dt>Destination</dt><dd>{draft.requirements.destinationCountry ?? "Unknown"}</dd></div>
              <div><dt>Delivered cap</dt><dd>{budget ? formatMoney(budget.currency, budget.minorUnits) : "Unknown"}</dd></div>
              <div><dt>Seller channel</dt><dd>{draft.requirements.allowResellers === false ? "No resellers" : draft.requirements.allowResellers ? "Resellers allowed" : "Unknown"}</dd></div>
              <div><dt>Notification</dt><dd>{draft.notificationPolicy.mode === "ONCE" ? "Once" : "Meaningful improvement"}</dd></div>
            </dl>
          ) : (
            <p className="review-empty">Structured hard requirements will appear here as the conversation develops.</p>
          )}

          {interpretation?.interpretation.ambiguities.length ? (
            <div className="clarifications">
              <strong>Needs clarification</strong>
              <ul>
                {interpretation.interpretation.ambiguities.map((item) => (
                  <li key={`${item.code}-${item.fieldPath}`}>{item.clarificationQuestion}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {interpretation?.interpretation.mandateIntent.requested ? (
            <p className="mandate-warning">
              Auto-buy intent detected. Confirmation here activates monitoring only; a separate purchase mandate is still required.
            </p>
          ) : null}

          <button
            className="confirm-brief"
            type="button"
            onClick={confirmRequest}
            disabled={!interpretation?.canConfirm || pending !== null || confirmedRequest !== null}
          >
            {pending === "confirm" ? "Confirming…" : confirmedRequest ? "Request confirmed" : "Confirm hard requirements"}
          </button>
          <p className="connector-note">Event subscription: the matching curated scenario starts after confirmation.</p>
        </aside>
      </div>
    </section>
  );
}
