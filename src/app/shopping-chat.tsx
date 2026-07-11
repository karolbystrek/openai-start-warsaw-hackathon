"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { formatMoney } from "@/app/format-money";
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

const DEMO_BRIEF = "Nike Dunk Low, size 43, under EUR 80 delivered to Poland. New only, no resellers. Notify me once.";

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

export function ShoppingChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [userTurns, setUserTurns] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [interpretation, setInterpretation] = useState<InterpretationResponse | null>(null);
  const [confirmedRequest, setConfirmedRequest] = useState<ShoppingRequest | null>(null);
  const [pending, setPending] = useState<"interpret" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
                <span>{message.role === "assistant" ? "Assistant" : "You"}</span>
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
              maxLength={2_000}
              onChange={(event) => setInput(event.target.value)}
              placeholder="e.g. Nike Dunk Low, EU 43, under EUR 80 delivered to Poland…"
              rows={3}
              value={input}
            />
            <div className="composer-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setInput(DEMO_BRIEF)}
                disabled={pending !== null}
              >
                Use demo brief
              </button>
              <div>
                <button className="text-button" type="button" onClick={resetChat} disabled={pending !== null}>Clear</button>
                <button className="send-button" type="submit" disabled={!input.trim() || pending !== null}>
                  {pending === "interpret" ? "Reading…" : "Send"}
                </button>
              </div>
            </div>
          </form>
          {error ? <p className="chat-error" role="alert">{error}</p> : null}
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
              <div><dt>Size</dt><dd>{draft.requirements.size ?? "Unknown"}</dd></div>
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

          {interpretation ? (
            <details className="interpretation-details">
              <summary>Interpretation details</summary>
              <dl>
                <div><dt>Source</dt><dd>{interpretation.interpretation.provenance.kind}</dd></div>
                <div><dt>Adapter</dt><dd>{interpretation.interpretation.provenance.source}</dd></div>
                <div><dt>Model</dt><dd>{interpretation.interpretation.provenance.model ?? "Deterministic"}</dd></div>
                <div><dt>Schema</dt><dd>{interpretation.interpretation.provenance.outputSchemaVersion ?? "Not specified"}</dd></div>
              </dl>
            </details>
          ) : null}

          <button
            className="confirm-brief"
            type="button"
            onClick={confirmRequest}
            disabled={!interpretation?.canConfirm || pending !== null || confirmedRequest !== null}
          >
            {pending === "confirm" ? "Confirming…" : confirmedRequest ? "Request confirmed" : "Confirm hard requirements"}
          </button>
          <p className="connector-note">
            {confirmedRequest ? "Monitoring active for the confirmed request." : "Merchant monitoring starts only after explicit confirmation."}
          </p>
        </aside>
      </div>
    </section>
  );
}
