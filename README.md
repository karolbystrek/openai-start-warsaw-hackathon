# AI Shopping Assistant

Checkpoint 1 base for the OpenAI × START Warsaw Hackathon Solidgate case. The app validates deterministic merchant events, sends them through frozen service interfaces, stores the resulting audit records in SQLite, and renders the first rejection-to-alert demo slice.

The Next.js foundation was generated with `npx create-next-app@latest` defaults and pnpm, then organized under `src/` to preserve the ownership boundaries in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Start locally

Requirements: Node.js 20+ and pnpm 11.

```bash
pnpm install
pnpm db:reset
pnpm dev
```

Open <http://localhost:3000>, reset the scenario, and step through five fixture events. The timeline rejects a wrong model, a GBP offer at EUR 81.60 landed, and an invalid coupon before producing an alert for the EUR 76.40 offer and then emitting a low-stock update.

No environment file or OpenAI API key is needed. Deterministic adapters and a repository-local SQLite path are the defaults. To use the optional OpenAI adapter later, copy `.env.example` to `.env.local` and configure `OPENAI_API_KEY` and `OPENAI_MODEL`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the local Next.js app |
| `pnpm build` | Create a production build |
| `pnpm lint` | Check ESLint rules and Next.js conventions |
| `pnpm typecheck` | Run strict TypeScript checks |
| `pnpm db:generate` | Generate a Drizzle migration from the schema |
| `pnpm db:migrate` | Apply migrations to the configured SQLite database |
| `pnpm db:reset` | Recreate a clean local database |
| `pnpm db:seed` | Store the headline shopping request |
| `pnpm verify` | Run lint, strict type-checking, and a production build |

## Architecture and ownership

Dependencies point inward. `src/domain` contains Zod contracts and service interfaces and may not import Next.js, OpenAI, persistence, application, or simulator code. Evaluation-only ground-truth labels live outside runtime source under `evaluation/`.

- Person A / `feat/trust-core`: authoritative pricing, verification, policy, notifications, audit, and evaluations.
- Person B / `feat/intelligence-simulator`: brief interpretation, catalog, matching, AI adapters, simulator, and scenarios.
- Person C / `feat/product-integration`: application orchestration, SQLite/Drizzle, UI, and end-to-end integration.

Checkpoint adapters are visibly marked `STUB` in decision provenance. They are contract-safe placeholders, not completed business judgment. Replace them at convergence checkpoints without changing UI-facing contracts.

Per the repository guidance, this project does not contain automated tests. Validate work with `pnpm verify`, database reset/seed commands, and a manual reset-and-step smoke check in the browser.

See [docs/BASELINE_DECISIONS.md](docs/BASELINE_DECISIONS.md) for the frozen scenario semantics.
Person B's catalog disclosures and manual verification record are in [docs/DEMO_CATALOG.md](docs/DEMO_CATALOG.md) and [docs/PERSON_B_VERIFICATION.md](docs/PERSON_B_VERIFICATION.md).
