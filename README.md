# Leafmark

Leafmark is an iPad-first reading and writing journal for elementary readers. A child reads a real book, records where they stopped, recalls what happened before receiving any hint, answers one pedagogy-selected comprehension question, completes one focused writing revision, and saves a permanent journal entry.

The product is intentionally not a chatbot, LMS, or gradebook. Instructional selection comes from `packages/pedagogy`; the swappable `LearningModel` in `packages/ai` only phrases or evaluates tightly constrained tasks. Student work remains authoritative as student work, never as canonical book content.

## Stack

React + TypeScript + Vite PWA; Fastify; PostgreSQL; IndexedDB offline draft persistence; TanStack Query; Zod; Vitest; Playwright; Bonsai 27B through an OpenAI-compatible endpoint when available.

## Run locally

Create a PostgreSQL database first, then:

```text
cp .env.example .env
# set DATABASE_URL in .env
npm install
npm run db:migrate
npm run dev
```

Development UI: `http://localhost:4173`  
API: `http://localhost:8787`

The example profiles are Gavin / 1357 and Savannah / 2468; Parent Mode is 2468. Change all PINs and `COOKIE_SECRET` before a real family deployment.

## Deploy on Render for free

Leafmark now uses PostgreSQL rather than a local SQLite file, so the Render web service does not need a persistent disk. The root `render.yaml` is configured for Render's free web-service plan.

Use a persistent hosted PostgreSQL database such as Neon and copy its connection string into Render as `DATABASE_URL`. Also set `PARENT_PIN` and `CHILDREN`; Render can generate `COOKIE_SECRET`. The start command passes `RENDER_EXTERNAL_URL` through as `APP_ORIGIN` automatically.

Migrations run at process startup before the server accepts requests. They are idempotent and tracked in `schema_migrations`.

A cloud Render service cannot directly reach a model server listening only on `127.0.0.1` at home. Without a remotely reachable OpenAI-compatible endpoint, Leafmark uses deterministic safe fallbacks. If you later expose a suitable endpoint, set `LOCAL_AI_BASE_URL`, `LOCAL_AI_API_KEY`, and optionally `LOCAL_AI_MODEL`.

## Production

```text
npm run test
npm run build
NODE_ENV=production npm start
```

## AI configuration

By default Leafmark expects `http://127.0.0.1:1234/v1` and model name `Bonsai-27B`. Normal generations are deliberately short. Model output is Zod-validated, timed out, and constrained by pedagogy-engine decisions.

Run `npm run eval:ai` while Bonsai is online to execute the reusable model-comparison suite.

## Evidence

The initial evidence registry uses U.S. Department of Education / IES / What Works Clearinghouse practice guides for K–3 reading comprehension and elementary writing. Parent Mode exposes the source, grade applicability, instructional method, implementation, measurement, and success criteria for every strategy.

## Data durability

Permanent app data lives in PostgreSQL. For a cloud deployment, use the database provider's backup/export facilities and keep the connection string private. Browser drafts and queued mutations remain in IndexedDB so an interrupted request does not erase a child's current work.

## Repository map

- `apps/web` child + parent PWA
- `apps/server` API, auth, PostgreSQL access, metadata adapter
- `packages/pedagogy` evidence registry and deterministic instructional engine
- `packages/ai` swappable, schema-validated model interface and safe fallbacks
- `packages/schemas` AI/data contracts
- `packages/shared` deterministic utilities such as ISBN validation
- `database/migrations` PostgreSQL migrations
- `tests/ai-evals` reusable Bonsai/model comparison harness
- `tests/e2e` device-oriented Playwright coverage
