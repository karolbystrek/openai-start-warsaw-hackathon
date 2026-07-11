# AI Shopping Assistant

Integrated alert slice for the OpenAI × START Warsaw Hackathon Solidgate case. The app interprets and confirms a natural-language brief, matches deterministic merchant events through the real staged catalog matcher, applies the trust-core services, stores audit records in SQLite, and renders the rejection-to-alert journey.

The Next.js foundation was generated with `npx create-next-app@latest` defaults and pnpm, then organized under `src/` to preserve the ownership boundaries in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Start locally

Requirements: Node.js 20+ and pnpm 11.

```bash
pnpm install
pnpm db:reset
pnpm dev
```

Open <http://localhost:3000>, interpret and confirm a brief (the complete example is ready to use), then step through five deterministic simulator events. The timeline rejects a wrong model, an above-cap GBP offer, and an invalid-coupon offer before producing an alert for the EUR 76.40 offer and then emitting a low-stock update.

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

The running app uses the real Person A trust-core services and Person B brief/matching services. Fixture adapters remain only as isolated checkpoint helpers. The merchant feed itself stays deterministic and simulated by design so the demo is repeatable.

Per the repository guidance, this project does not contain automated tests. Validate work with `pnpm verify`, database reset/seed commands, and a manual reset-and-step smoke check in the browser.

See [docs/BASELINE_DECISIONS.md](docs/BASELINE_DECISIONS.md) for the frozen scenario semantics.
Person B's catalog disclosures and manual verification record are in [docs/DEMO_CATALOG.md](docs/DEMO_CATALOG.md) and [docs/PERSON_B_VERIFICATION.md](docs/PERSON_B_VERIFICATION.md).
