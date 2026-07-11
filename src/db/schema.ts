import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull(),
};

export const chats = sqliteTable("chats", {
  id: text("id").primaryKey(),
  userSessionId: text("user_session_id").notNull(),
  title: text("title").notNull(),
  statePayload: text("state_payload").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
  ...timestamps,
});

export const chatMessages = sqliteTable("chat_messages", {
  id: text("id").primaryKey(),
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  ...timestamps,
});

export const chatMonitoringRequests = sqliteTable("chat_monitoring_requests", {
  chatId: text("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  requestVersion: integer("request_version").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("chat_monitoring_request_idx").on(table.chatId, table.requestId, table.requestVersion),
]);

export const simulationRuns = sqliteTable("simulation_runs", {
  id: text("id").primaryKey(),
  seed: text("seed").notNull(),
  virtualStartAt: text("virtual_start_at").notNull(),
  ...timestamps,
});

export const simulationEvents = sqliteTable("simulation_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  sequence: integer("sequence").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payload: text("payload").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("simulation_events_run_sequence_idx").on(table.runId, table.sequence)]);

export const requestVersions = sqliteTable("request_versions", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  effectiveAt: text("effective_at").notNull(),
  payload: text("payload").notNull(),
  ...timestamps,
}, (table) => [uniqueIndex("request_versions_id_version_idx").on(table.id, table.version)]);

export const offerSnapshots = sqliteTable("offer_snapshots", {
  id: text("id").primaryKey(),
  listingId: text("listing_id").notNull(),
  merchantId: text("merchant_id").notNull(),
  observedAt: text("observed_at").notNull(),
  payload: text("payload").notNull(),
  ...timestamps,
});

export const decisionRecords = sqliteTable("decision_records", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull(),
  requestVersion: integer("request_version").notNull(),
  eventId: text("event_id").notNull(),
  policyVersion: text("policy_version").notNull().default("legacy-policy-v0"),
  outcome: text("outcome").notNull(),
  decidedAt: text("decided_at").notNull(),
  payload: text("payload").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("decision_records_evaluation_idx").on(
    table.requestId,
    table.requestVersion,
    table.eventId,
    table.policyVersion,
  ),
]);

export const mandateVersions = sqliteTable("mandate_versions", {
  id: text("id").notNull(),
  version: integer("version").notNull(),
  requestId: text("request_id").notNull(),
  requestVersion: integer("request_version").notNull(),
  status: text("status").notNull(),
  effectiveAt: text("effective_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  payload: text("payload").notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex("mandate_versions_id_version_idx").on(table.id, table.version),
]);

export const simulatedOrders = sqliteTable("simulated_orders", {
  id: text("id").primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestId: text("request_id").notNull(),
  decisionId: text("decision_id").notNull(),
  createdAt: text("created_at").notNull(),
  payload: text("payload").notNull(),
});
