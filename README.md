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

Open <http://localhost:3000>, choose one of the three presentation briefs, send it, confirm the interpreted hard requirements, and step through the automatically selected deterministic scenario.

No environment file or OpenAI API key is needed for the deterministic text flow. Deterministic adapters and a repository-local SQLite path are the defaults. To enable the optional voice controls, copy `.env.example` to `.env.local` and configure `OPENAI_API_KEY`.

## Presentation scope

The live demo intentionally supports exactly three curated products. A fourth product remains blocked at confirmation instead of falling into an unverified generic flow.

| Example | Hard variant | Delivered cap | Deterministic story |
| --- | --- | ---: | --- |
| Nike Dunk Low | EU 43 | EUR 80 | Wrong model, over-cap offer, and invalid coupon are rejected before a EUR 76.40 alert. |
| Iittala Aalto Vase | 160 mm, clear glass | EUR 140 | A cheap 120 mm opal listing is rejected before a EUR 128.00 alert. |
| MacBook Air M3 | 13-inch, 16 GB RAM, 512 GB SSD | EUR 1,300 | A cheap M2 8/256 listing is rejected before a EUR 1,238.00 alert. |

For a reliable presentation, use the three **Try** buttons in the chat. Confirmation resets previous evidence, activates the matching scenario, and updates the event counter to that scenario's actual length. The scenario remains deterministic and can be repeated with **Reset**.

## OpenAI voice

With `VOICE_INTAKE_ENABLED=true` and `OPENAI_API_KEY` configured, the chat supports microphone dictation through `/api/voice/transcribe` and AI-generated speech through `/api/voice/speech`. The defaults are `gpt-4o-mini-transcribe`, `gpt-4o-mini-tts`, and the `marin` voice; both model IDs are configurable in `.env.local`.

Dictation always lands in the textarea for review before it becomes a chat turn. Voice can propose a draft, but it cannot confirm hard constraints, activate a purchase mandate, or bypass the existing non-voice confirmation button. Set `VOICE_INTAKE_ENABLED=false` to remove audio without changing the text journey.

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
