"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatMoney } from "@/app/format-money";
import type { MonitoringListItem } from "@/application/chat-history";

type MonitoringTab = "active" | "history";

export function MonitoringList() {
  const [tab, setTab] = useState<MonitoringTab>("active");
  const [items, setItems] = useState<MonitoringListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/monitoring", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { items?: MonitoringListItem[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load monitoring requests.");
        setItems(payload.items ?? []);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load monitoring requests."))
      .finally(() => setLoading(false));
  }, []);

  const visible = items.filter((item) => tab === "active"
    ? item.lifecycle === "ACTIVE"
    : item.lifecycle !== "ACTIVE");

  return (
    <main className="monitoring-page">
      <header className="monitoring-header">
        <Link className="chat-brand" href="/" aria-label="AI Shopping Assistant home">
          <span className="brand-mark">S</span>
          <span>Shopping Assistant</span>
        </Link>
        <Link className="details-link" href="/">New chat</Link>
      </header>

      <section className="monitoring-content">
        <p className="eyebrow">Your saved searches</p>
        <h1>Monitoring</h1>
        <p className="monitoring-lede">Open any product to return to the chat where you set its requirements.</p>

        <div className="monitoring-tabs" role="tablist" aria-label="Monitoring status">
          <button role="tab" aria-selected={tab === "active"} onClick={() => setTab("active")}>
            Active <span>{items.filter((item) => item.lifecycle === "ACTIVE").length}</span>
          </button>
          <button role="tab" aria-selected={tab === "history"} onClick={() => setTab("history")}>
            History <span>{items.filter((item) => item.lifecycle !== "ACTIVE").length}</span>
          </button>
        </div>

        {loading ? <p className="monitoring-empty">Loading your monitored products…</p> : null}
        {error ? <p className="monitoring-error" role="alert">{error}</p> : null}
        {!loading && !error && visible.length === 0 ? (
          <div className="monitoring-empty">
            <h2>{tab === "active" ? "Nothing is being monitored yet" : "No monitoring history yet"}</h2>
            <p>{tab === "active" ? "Confirm a shopping brief in chat and it will appear here." : "Paused, revoked, and fulfilled searches will appear here."}</p>
            {tab === "active" ? <Link href="/">Start a shopping chat</Link> : null}
          </div>
        ) : null}

        <div className="monitoring-grid">
          {visible.map((item) => (
            <Link className="monitoring-card" href={`/?chat=${item.chatId}`} key={`${item.requestId}-${item.chatId}`}>
              <div>
                <span className={`monitoring-status ${item.lifecycle.toLowerCase()}`}>{item.lifecycle}</span>
                <h2>{item.title}</h2>
                <p>{item.variant ?? "Any variant"}</p>
              </div>
              <dl>
                <div><dt>Maximum delivered</dt><dd>{formatMoney(item.maximumLandedCost.currency, item.maximumLandedCost.minorUnits)}</dd></div>
                <div><dt>Started</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(item.createdAt))}</dd></div>
              </dl>
              <strong>Open chat <span aria-hidden="true">→</span></strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
