"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { formatMoney } from "@/app/format-money";
import {
  VoiceShoppingCompanion,
  type VoiceBriefReview,
} from "@/app/voice-shopping-companion";
import { presentationProducts } from "@/domain/catalog/presentation-products";
import type {
  ShoppingBriefInterpretation,
  ShoppingRequest,
} from "@/domain/contracts";

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

const MAX_COMPOSER_HEIGHT = 130;

const initialMessages: ChatMessage[] = [{
  id: "welcome",
  role: "assistant",
  content: "Tell me what you want to buy. I’ll separate hard requirements from preferences and flag anything that needs clarification.",
}];

function assistantSummary(result: InterpretationResponse): string {
  const questions = result.interpretation.ambiguities
    .filter((item) => item.blocking)
    .map((item) => item.clarificationQuestion);
  if (questions.length > 0) {
    const { brand, model } = result.interpretation.requestDraft.product;
    const product = [brand, model].filter(Boolean).join(" ");
    const remaining = questions.length - 1;
    return `${product ? `I’m tracking ${product}. ` : "Let’s make the search precise. "}${questions[0]}${remaining > 0 ? ` We’ll cover ${remaining} more ${remaining === 1 ? "detail" : "details"} after that.` : ""}`;
  }
  return "The brief is complete. Review the hard constraints below and confirm them before monitoring is activated.";
}

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(payload?.error ?? "The shopping assistant request failed.");
  if (!payload) throw new Error("The shopping assistant returned an empty response.");
  return payload;
}

export function ShoppingChat() {
  const router = useRouter();
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [userTurns, setUserTurns] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [interpretation, setInterpretation] = useState<InterpretationResponse | null>(null);
  const [confirmedRequest, setConfirmedRequest] = useState<ShoppingRequest | null>(null);
  const [pending, setPending] = useState<"interpret" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const summonVoice = () => window.dispatchEvent(new Event("shopping-voice-summon"));

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || pending) return;
    if (/^\/(?:voice|scout)$/i.test(content)) {
      setInput("");
      summonVoice();
      return;
    }

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
      setMessages((current) => [...current, {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: assistantSummary(result),
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not interpret the brief.");
    } finally {
      setPending(null);
    }
  };

  const reviewVoiceBrief = useCallback(async (brief: string): Promise<VoiceBriefReview> => {
    const content = brief.trim();
    setError(null);
    setConfirmedRequest(null);
    setUserTurns([content]);
    setPending("interpret");
    setMessages((current) => [
      ...current.filter((message) => message.id !== "voice-brief" && message.id !== "voice-review"),
      { id: "voice-brief", role: "user", content: `Voice brief: ${content}` },
    ]);

    try {
      const response = await fetch("/api/chat/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [content] }),
      });
      const result = await readResponse<InterpretationResponse>(response);
      const summary = assistantSummary(result);
      const missingQuestions = result.interpretation.ambiguities
        .filter((item) => item.blocking)
        .map((item) => item.clarificationQuestion);
      setInterpretation(result);
      setMessages((current) => [
        ...current.filter((message) => message.id !== "voice-review"),
        { id: "voice-review", role: "assistant", content: summary },
      ]);
      return { complete: result.canConfirm, missingQuestions, summary };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not review the spoken brief.";
      setError(message);
      throw cause;
    } finally {
      setPending(null);
    }
  }, []);

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
        setMessages((current) => [...current, {
          id: `assistant-${crypto.randomUUID()}`,
          role: "assistant",
          content: assistantSummary(result),
        }]);
        return;
      }
      setConfirmedRequest(result.request);
      setMessages((current) => [...current, {
        id: `assistant-${crypto.randomUUID()}`,
        role: "assistant",
        content: result.monitoring === "ACTIVE"
          ? "Request confirmed. Monitoring is active and ready for merchant events."
          : "Request confirmed and saved. Monitoring activation is still pending.",
      }]);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not confirm the brief.");
    } finally {
      setPending(null);
    }
  };

  const resetChat = () => {
    setMessages(initialMessages);
    setUserTurns([]);
    setInput("");
    setInterpretation(null);
    setConfirmedRequest(null);
    setError(null);
  };

  const draft = interpretation?.interpretation.requestDraft;
  const budget = draft?.requirements.maximumLandedCost;

  useEffect(() => {
    if (userTurns.length === 0) return;
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [interpretation, messages, pending, userTurns.length]);

  useLayoutEffect(() => {
    const textarea = messageInputRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_COMPOSER_HEIGHT ? "auto" : "hidden";
  }, [input]);

  return (
    <main className="chat-page">
      <header className="chat-topbar">
        <Link className="chat-brand" href="/" aria-label="AI Shopping Assistant home">
          <span className="brand-mark">S</span>
          <span>Shopping Assistant</span>
        </Link>
        <nav aria-label="Chat actions">
          <button className="new-chat" type="button" onClick={summonVoice} disabled={pending !== null}>Call Scout</button>
          <button className="new-chat" type="button" onClick={resetChat} disabled={pending !== null}>New chat</button>
          <Link className="details-link" href="/details">Details</Link>
        </nav>
      </header>

      <section className="chat-thread" aria-labelledby="chat-title">
        <div className="chat-welcome">
          <span className="assistant-orb" aria-hidden="true">S</span>
          <h1 id="chat-title">What are you looking for?</h1>
          <p>Tell me the item, your budget, and any deal-breakers. I’ll watch the full delivered price.</p>
          {messages.length === 1 ? (
            <div className="chat-demo-prompts" aria-label="Focused demo products">
              {presentationProducts.map((profile) => (
                <button className="demo-prompt demo-product-prompt" type="button" key={profile.id} onClick={() => setInput(profile.brief)}>
                  <span className="demo-product-image" aria-hidden="true">
                    <Image src={profile.image.src} alt="" fill sizes="32px" />
                  </span>
                  {profile.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <VoiceShoppingCompanion
          disabled={pending !== null}
          onBriefReview={reviewVoiceBrief}
        />

        <div className="chat-messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`chat-message ${message.role}`} key={message.id}>
              <span>{message.role === "assistant" ? "Assistant" : "You"}</span>
              <p>{message.content}</p>
            </div>
          ))}
          {pending === "interpret" ? (
            <div className="chat-message assistant thinking">
              <span>Assistant</span><p>Reading your requirements…</p>
            </div>
          ) : null}

          {draft ? (
            <div className="chat-message assistant chat-brief-message">
              <span>Your brief</span>
              <div className="chat-brief">
                <div className="chat-brief-heading">
                  <h2>{draft.product.brand} {draft.product.model}</h2>
                  <small>{confirmedRequest ? "Monitoring" : interpretation?.canConfirm ? "Ready" : "Needs details"}</small>
                </div>
                <dl>
                  <div><dt>Required variant</dt><dd>{draft.requirements.size ?? "Not set"}</dd></div>
                  <div><dt>Condition</dt><dd>{draft.requirements.condition ?? "Not set"}</dd></div>
                  <div><dt>Deliver to</dt><dd>{draft.requirements.destinationCountry ?? "Not set"}</dd></div>
                  <div><dt>Maximum delivered</dt><dd>{budget ? formatMoney(budget.currency, budget.minorUnits) : "Not set"}</dd></div>
                  <div><dt>Seller</dt><dd>{draft.requirements.allowResellers === false ? "No resellers" : draft.requirements.allowResellers ? "Resellers allowed" : "Not set"}</dd></div>
                </dl>
                {interpretation?.interpretation.ambiguities.length ? (
                  <ul className="chat-questions">
                    {interpretation.interpretation.ambiguities.map((item) => (
                      <li key={`${item.code}-${item.fieldPath}`}>{item.clarificationQuestion}</li>
                    ))}
                  </ul>
                ) : null}
                {interpretation?.interpretation.mandateIntent.requested ? (
                  <p className="chat-safety-note">This starts monitoring only. Buying automatically always requires separate approval.</p>
                ) : null}
                <button
                  className="confirm-brief"
                  type="button"
                  onClick={confirmRequest}
                  disabled={!interpretation?.canConfirm || pending !== null || confirmedRequest !== null}
                >
                  {pending === "confirm" ? "Confirming…" : confirmedRequest ? "Monitoring active" : "Confirm and start monitoring"}
                </button>
              </div>
            </div>
          ) : null}
          <div className="conversation-end" ref={conversationEndRef} />
        </div>
      </section>

      <form className="chat-composer" onSubmit={sendMessage}>
        <label className="sr-only" htmlFor="shopping-message">Message the shopping assistant</label>
        <textarea
          id="shopping-message"
          maxLength={2_000}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Describe what you want to buy…"
          ref={messageInputRef}
          rows={1}
          value={input}
        />
        <button className="send-button" type="submit" disabled={!input.trim() || pending !== null} aria-label="Send message">
          {pending === "interpret" ? (
            <span className="send-loader" />
          ) : (
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M10 15V5m0 0L6 9m4-4 4 4" />
            </svg>
          )}
        </button>
      </form>
      {error ? <p className="chat-error" role="alert">{error}</p> : null}
    </main>
  );
}
