# AI Shopping Assistant

Integrated alert slice for the OpenAI × START Warsaw Hackathon Solidgate case. The app interprets and confirms a natural-language brief, matches deterministic merchant events through the real staged catalog matcher, applies the trust-core services, stores audit records in SQLite, and renders the rejection-to-alert journey.

The Next.js foundation was generated with `npx create-next-app@latest` defaults and pnpm, then organized under `src/` to preserve the ownership boundaries in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## Start locally

Requirements: Node.js 20+ and pnpm 11.

```bash
nvm use
corepack enable
corepack install --global pnpm@11.7.0
pnpm install
pnpm db:reset
pnpm dev
```

The repository includes `.nvmrc` pinned to Node.js 22.22.2. If `pnpm` is missing or the shell reports Node.js 18, run the three bootstrap commands above before installing dependencies.

Open <http://localhost:3000>, interpret and confirm a brief (the complete example is ready to use), then open the details view. You may explicitly activate the scoped one-time purchase mandate before stepping through five deterministic simulator events. The timeline rejects a wrong model, an above-cap GBP offer, and an invalid-coupon offer, alerts on the EUR 76.40 offer, and performs one simulated purchase only after the final fresh low-stock update satisfies the active mandate. Without consent, the alert journey remains unchanged.

The details view also supports pausing, resuming, and revoking monitoring. Each lifecycle transition creates an immutable request version; pausing or revoking prevents event processing and immediately revokes active purchase consent.

No environment file or OpenAI API key is needed. Deterministic adapters and a repository-local SQLite path are the defaults. To use the optional OpenAI adapter later, copy `.env.example` to `.env.local` and configure `OPENAI_API_KEY` and `OPENAI_MODEL`.

## Commands

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run the local Next.js app |
| `pnpm build` | Create a production build |
| `pnpm lint` | Check ESLint rules and Next.js conventions |
| `pnpm typecheck` | Run strict TypeScript checks |
| `pnpm evaluate:trust-core` | Run the reproducible manual Person A evaluation and boundary report |
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

Per the repository guidance, this project does not contain automated tests. Validate work with `pnpm verify`, `pnpm evaluate:trust-core`, database reset/seed commands, and a manual reset-and-step smoke check in the browser.

See [docs/BASELINE_DECISIONS.md](docs/BASELINE_DECISIONS.md) for the frozen scenario semantics.
Person B's catalog disclosures and manual verification record are in [docs/DEMO_CATALOG.md](docs/DEMO_CATALOG.md) and [docs/PERSON_B_VERIFICATION.md](docs/PERSON_B_VERIFICATION.md).
