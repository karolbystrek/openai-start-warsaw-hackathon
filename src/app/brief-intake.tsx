"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { ShoppingBriefInterpretation } from "@/domain/contracts";

const EXAMPLE = "Nike Dunk Low, size 43, under EUR 80 delivered to Poland. New only, no resellers. Notify me once.";

export function BriefIntake({ initialText }: { initialText: string }) {
  const router = useRouter();
  const [sourceText, setSourceText] = useState(initialText);
  const [interpretation, setInterpretation] = useState<ShoppingBriefInterpretation | null>(null);
  const [pending, setPending] = useState<"interpret" | "activate" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: "interpret" | "activate") => {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/api/brief/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceText }),
      });
      const payload = await response.json() as { interpretation?: ShoppingBriefInterpretation; error?: string } | ShoppingBriefInterpretation;
      const parsed = "schemaVersion" in payload ? payload : payload.interpretation;
      if (parsed) setInterpretation(parsed);
      if (!response.ok) throw new Error("error" in payload ? payload.error : "Brief processing failed.");
      if (action === "activate") router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Brief processing failed.");
    } finally {
      setPending(null);
    }
  };

  const canActivate = interpretation && interpretation.originalText === sourceText.trim()
    && !interpretation.ambiguities.some((item) => item.blocking);
  const draft = interpretation?.requestDraft;

  return (
    <section className="brief-intake card">
      <div className="section-heading">
        <div>
          <p className="card-label">Person B · brief intelligence</p>
          <h2>Describe the deal you want</h2>
        </div>
        {interpretation ? <span className={`status-pill ${canActivate ? "pass" : "unknown"}`}>{canActivate ? "Ready to activate" : "Needs clarification"}</span> : null}
      </div>
      <textarea value={sourceText} onChange={(event) => setSourceText(event.target.value)} rows={4} aria-label="Shopping brief" />
      <div className="brief-actions">
        <button type="button" onClick={() => submit("interpret")} disabled={pending !== null}>{pending === "interpret" ? "Interpreting…" : "Interpret brief"}</button>
        <button type="button" className="secondary" onClick={() => submit("activate")} disabled={pending !== null || !canActivate}>{pending === "activate" ? "Activating…" : "Confirm & activate"}</button>
        <button type="button" className="text-button" onClick={() => setSourceText(EXAMPLE)}>Use complete example</button>
      </div>
      {error ? <p className="control-error" role="alert">{error}</p> : null}
      {interpretation ? (
        <div className="interpretation">
          <dl>
            <div><dt>Product</dt><dd>{[draft?.product.brand, draft?.product.model].filter(Boolean).join(" ") || "Unresolved"}</dd></div>
            <div><dt>Size / condition</dt><dd>{draft?.requirements.size ?? "Unresolved"} · {draft?.requirements.condition ?? "Unresolved"}</dd></div>
            <div><dt>Destination</dt><dd>{draft?.requirements.destinationCountry ?? "Unresolved"}</dd></div>
            <div><dt>Delivered cap</dt><dd>{draft?.requirements.maximumLandedCost ? `${draft.requirements.maximumLandedCost.currency} ${(draft.requirements.maximumLandedCost.minorUnits / 100).toFixed(2)}` : "Unresolved"}</dd></div>
          </dl>
          {interpretation.ambiguities.length ? (
            <ul className="ambiguities">{interpretation.ambiguities.map((item) => <li key={`${item.code}-${item.fieldPath}`}><strong>{item.code.replaceAll("_", " ")}</strong><span>{item.clarificationQuestion}</span></li>)}</ul>
          ) : <p className="all-clear">All hard requirements are explicit. Confirmation activates monitoring; purchase consent is never inferred.</p>}
          <small>{interpretation.provenance.kind} · {interpretation.provenance.source} · {interpretation.provenance.outputSchemaVersion}</small>
        </div>
      ) : null}
    </section>
  );
}
