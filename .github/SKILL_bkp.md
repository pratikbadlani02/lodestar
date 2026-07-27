---
name: react-frontend-analysis
description: "Analyze and document React frontends — TypeScript or JavaScript, single-page apps or Module Federation micro-frontends (MFEs)."
version: 2.2.0
author: "lodestar"
license: MIT
---

# React / Frontend Analysis Skill

Produce a standardized, table-first documentation set for any React frontend so output is consistent and comparable across teams.

## When To Use

| Trigger | In scope |
|---|---|
| Document an existing React SPA (`react-app`, Vite/Webpack/CRA) | Yes |
| Document a Module Federation micro-frontend (`react-mfe`, host/remote) | Yes |
| Map routes, API boundaries, state, data-fetching, deployment | Yes |
| Meta-frameworks with SSR/RSC/file routing (Next.js, Remix, Gatsby, Astro) | Needs adaptation — file routing, server data loading, and SSR/edge deploy differ from the SPA assumptions below |
| React Native / Expo (no DOM, native navigation) | No |
| Greenfield/new-build design, or non-React frontends | No |

This skill assumes a **client-rendered React SPA**. The `Read` paths and static-deploy model in the specs below reflect that; adapt them for meta-frameworks.

## Global Conventions

| Rule | Requirement |
|---|---|
| Evidence | Every fact cites a file path (and line where useful). No claim without a source. |
| Unverified | Anything inferred or unconfirmed is prefixed `⚠️ UNVERIFIED`. Never invent. |
| TS vs JS | TS-only steps (`tsconfig`, interfaces) are skipped for JS apps; reconstruct shapes from usage and mark `⚠️` inferred. |
| Not applicable | If a section's feature is absent (e.g. no MFE, no Markdown), write a one-line **N/A — reason** instead of padding. |
| Output location | All docs into one folder, default `docs/frontend-analysis/`. Confirm if the repo has an existing docs convention. |
| Sizing | Small app (≲10 routes): concise docs, one diagram per file where it adds clarity. Large app: full diagram targets. Never pad. |
| Tables first | Prefer the defined table schemas below over prose. Use prose only for narrative that a table cannot express. |

## Per-File Specifications

Produce these nine files **in order** — later files reuse facts established earlier. Each spec defines everything needed to write that file: **Read** (where to look), **Tables** (exact column schemas — add columns only if the codebase demands, never remove; use `—`/`N/A`), **Diagrams**, and **Done when** (completion bar). Diagrams use Mermaid in ` ```mermaid ` fences.

### `01-architecture.md`
- **Read:** `package.json`, `vite.config.*`/`webpack.*`, `tsconfig.json`/`jsconfig.json`
- **Tables:**
  - Stack — `| Concern | Value | Source |`
  - Build config — `| Setting | Value | Source |` (port, base path, aliases, env prefix, chunking)
- **Diagrams:** (1) component architecture; (2) system context (external callers + downstream services)
- **Done when:** stack + build tables filled; state/data-layer summary present; both diagrams included.

### `02-routing-and-navigation.md`
- **Read:** `main.*`, `App.*`, router config
- **Tables:**
  - Route map — `| Route | Component | Access | Guard | Params | Data source | Loading strategy | Purpose |`
    (`Access` = Public / Private / Admin; `Loading strategy` = loader / useEffect / store / static)
- **Diagrams:** none
- **Done when:** bootstrap sequence; full route-map table; auth-gating rule; deep-link/param handling; external entry points or N/A.

### `03-access-and-rules.md`
- **Read:** route guards, auth module, config/feature flags
- **Tables:**
  - Access & rules — `| Rule | Behavior | Enforced where (file) | Scope (route/feature) |`
- **Diagrams:** none
- **Done when:** access-rules table; auth/authz scheme; scoping/multi-tenant; validation approach; feature flags or N/A. (Real-time invalidation rules live in `07`; reference them here.)

### `04-data-model.md`
- **Read:** store modules, context modules, `lib/api.*`/`src/services/*`
- **Tables:**
  - State store — `| Slice / key | Shape | Origin (server/client) | Updated by | Persisted to | Consumers |`
  - Context / client state — `| Context | Shape | Storage key | Cross-tab sync | Consumers |`
  - API endpoint catalog — `| Method | Path | Caller (fn) | Request shape | Response shape | Auth | Notes |` (canonical home; referenced by `05`, `08`)
- **Diagrams:** none
- **Done when:** all three tables; client-vs-server-state split; DTOs typed or `⚠️` inferred.

### `05-dependencies.md`
- **Read:** `package.json`, build config, federation plugin config
- **Tables:**
  - Dependencies — `| Package | Version | Role | Notes |`
  - Module Federation map *(MFE only)* — `| Role | Module name | Remote entry | Exposes | Consumes | Shared singletons |`
- **Conditional detection:**
  - **Module Federation** — detect `@module-federation/*`, `@originjs/vite-plugin-federation`, or Webpack `ModuleFederationPlugin`. Capture role (host/remote/both), `name`, `filename`, `remotes`, `exposes`, `shared` (singleton + version), runtime load strategy (static/dynamic import, Suspense/error-boundary fallback), and shared-context propagation (auth/theme/store). Absent ⇒ `N/A — no Module Federation`.
  - **Markdown / Mermaid rendering** — detect `react-markdown`, `remark-*`, `rehype-*`, `mermaid`. Capture renderer, remark/rehype plugins, sanitization (DOMPurify), and Mermaid init/theme. Absent ⇒ `N/A — no content Markdown pipeline`.
- **Diagrams:** none
- **Done when:** dependencies table; router/HTTP/state wiring; MFE map or N/A; Markdown note or N/A; dev ports/proxy; testing/lint tooling or note of absence.

### `06-runtime-flows.md`
- **Read:** fetch callers, interaction handlers, router transitions
- **Tables:** none (prose + diagrams)
- **Diagrams:** (1) happy-path sequence; (2) error/recovery sequence; (3) main end-to-end data flow. Add a routing/transform diagram where it adds clarity.
- **Done when:** page-lifecycle description; all three diagrams; mutation flow noted (optimistic or not).

### `07-state-and-data-fetching.md`
- **Read:** query hooks / fetch callers, WS/SSE/polling setup, cache config
- **Tables:**
  - Real-time events — `| Channel | Event / message type | Effect on state | Source |` (canonical home; referenced by `03`, `06`)
- **Diagrams:** optional (data-fetch / cache-invalidation flow if it adds clarity)
- **Done when:** fetching library/pattern; cache & invalidation strategy; real-time-events table or N/A; optimistic-update behavior or note of absence.

### `08-error-handling.md`
- **Read:** error boundary, request wrapper/interceptors, forms
- **Tables:**
  - HTTP status map — `| Status | Action | Source |`
  - Error handling — `| Trigger | Condition | Handler | User-facing result | Source |`
- **Diagrams:** none
- **Done when:** both tables; error-boundary scope; validation handling; telemetry or note of absence.

### `09-deployment.md`
- **Read:** Dockerfile, CI config, host config, `.env*`
- **Tables:**
  - Deployment matrix — `| Stage | Command / mechanism | Output / target | Env vars | Notes |`
- **Diagrams:** none
- **Done when:** deployment matrix; serving model (CDN/static/server); env-var matrix; Docker/K8s if present; health check/smoke test.