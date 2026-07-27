---
name: reverse-engineer-react
description: Systematically reverse-engineer and document an existing enterprise React codebase from full source. Use this whenever the user wants to understand, map, document, onboard onto, migrate, modernize, audit, or replicate features of a React or Next.js app they did not write — phrases like "understand this React app", "map this frontend's architecture", "document how this codebase works", "I inherited this React project", "plan a migration off this legacy React app", "audit this React app", or "how does feature X work in this code". Produces a structured architecture map plus goal-specific deliverables (onboarding guide, migration plan, audit report, or feature trace). Trigger it even when the user only says "help me figure out this frontend" — manual code-reading without this workflow tends to miss cross-cutting concerns, data flow, and build/config wiring.
---

# Reverse-Engineer an Enterprise React App

This skill turns an unfamiliar React/Next.js source repo into accurate, structured understanding. It assumes you have the **full source** and a shell (Claude Code). Work bottom-up from facts: inventory first, then map each layer, then synthesize into whatever deliverable the user needs.

The cardinal rule: **claim only what the code shows.** Enterprise frontends accumulate dead code, half-finished migrations, two state libraries at once, and comments that lie. Cite file paths for every structural claim. When two patterns coexist, say so rather than averaging them into a tidy fiction.

> **Paths in this skill** (`scripts/…`, `references/…`) are relative to this skill's own directory, *not* the target repo. Resolve them against the folder that contains this `SKILL.md`. If you don't know that absolute path, locate the asset first (e.g. search the workspace for `inventory.mjs` or `references/analysis-playbook.md`).

## Step 0 — Set the goal and depth

Confirm which deliverable the user wants, because it changes where you spend effort. Often it's more than one.

| Goal | Primary deliverable | Read this reference |
|------|--------------------|---------------------|
| Onboard / document | Architecture guide + diagrams | `references/onboarding.md` |
| Migrate / modernize | Inventory + risk/effort plan | `references/migration.md` |
| Audit | Security / perf / tech-debt findings | `references/audit.md` |
| Replicate a feature | End-to-end feature trace | `references/feature-tracing.md` |

The mapping phases below (Steps 1–7) are shared by all goals — do them first, then layer the goal-specific reference on top. If the user wants "all of the above," do the full map once, then produce each deliverable from it.

## Step 1 — Inventory (deterministic baseline)

Before reading any source by eye, get a factual snapshot. Run the bundled script (in this skill's `scripts/` folder) against the target repo root. Pass the skill script path and the repo path explicitly:

```bash
# <skill-dir> is the directory containing this SKILL.md; <repo-root> is the app under analysis.
node <skill-dir>/scripts/inventory.mjs <repo-root> --json /tmp/inventory.json
```

The script is zero-dependency (Node only) and never writes into the target repo.

It reports the meta-framework, build tool, package manager, monorepo layout, categorized libraries (state, data, styling, auth, i18n, monitoring, feature flags, etc.), file/LOC counts, the largest source files (complexity hot spots), routing strategy, and the config surface. Read the JSON and the Markdown summary. This anchors everything: it tells you *which* of the patterns in `references/analysis-playbook.md` actually apply, so you don't go hunting for Redux in a Zustand app.

If a library appears that you can't place, or you need to confirm a fuzzy signal (e.g. "is this really using React Query or just has it installed?"), consult `references/detection.md` for fingerprints, then grep the source to confirm real usage vs. a stale dependency.

## Step 2 — Map the entry & build pipeline

Establish how the app boots and how source becomes a bundle, because this frames the whole runtime.
- Find the entry (`src/main.tsx`, `src/index.tsx`, `app/layout.tsx`, or framework convention) and follow the provider stack wrapping the root — each provider (store, query client, theme, auth, i18n, router) is a subsystem to map later.
- Read the build config (`vite.config.*`, `next.config.*`, `webpack.config.*`) for aliases, env handling, proxies, code-splitting, and module-federation.
- Read the `scripts` block: how it's run, built, tested, linted, and deployed.

Depth techniques for each layer below are in `references/analysis-playbook.md` — read it once now; it's the core reference and the others assume it.

## Step 3 — Map routing & the page surface

Enumerate every route/page and what it renders. This is the app's table of contents and the backbone of any architecture diagram. The strategy (file-based vs. config vs. JSX route tree) was flagged in Step 1; use the matching technique in the playbook to produce a route → component → data-dependency table.

## Step 4 — Map state & data flow

The single highest-value thing to get right. Determine: what's local vs. global, which state library holds what, where server data enters (fetch/axios/React Query/GraphQL), how it's cached, and how mutations propagate. Watch for **multiple** state systems coexisting — common in enterprise apps mid-migration. Playbook has per-library tracing recipes.

## Step 5 — Map the backend contract

Reverse the API surface the frontend depends on: REST endpoints, GraphQL operations, websockets, base URLs, auth headers, and how env config switches them per environment. This is what a migration must preserve and what an audit scrutinizes. Build an endpoint inventory with the call sites.

## Step 6 — Map cross-cutting concerns

These hide between files and are what manual reading misses most: authentication & authorization (route guards, token handling), theming/design-system, i18n, feature flags, error boundaries & logging, analytics/telemetry, and forms/validation. Note for each whether it's centralized or scattered — that judgment drives both migration risk and audit findings.

## Step 7 — Assess complexity & health

Independent of goal, gauge the codebase's state: test coverage and kind (unit/integration/e2e), the largest/most-depended-on modules (from Step 1 hot spots — expand with an import-graph check), dependency age and known-vulnerable packages, dead code, and TypeScript strictness. This calibrates effort estimates and surfaces the obvious audit items.

## Step 8 — Synthesize the deliverable(s)

Now produce what the user asked for using the goal-specific reference(s) from Step 0. Across all of them:
- **Lead with a one-paragraph plain-English summary**: what the app does, its stack, and its single biggest architectural characteristic.
- **Diagram with Mermaid** (component/provider tree, route map, or data-flow) so structure is visible at a glance.
- **Ground every claim in file paths.** A reverse-engineering doc with no paths is an opinion.
- **Flag uncertainty explicitly.** "Appears unused — no imports found" beats silent omission, and "two routers present (legacy `react-router` + new `@tanstack/react-router`)" is exactly the kind of finding that matters.

## Working principles

- **Facts before narrative.** Run the inventory and grep before theorizing. Confirm a pattern is *used*, not just *installed*.
- **Breadth then depth.** Get the whole map shallow before deep-diving any one area, so the deep dive lands in context.
- **Respect the size.** On large monorepos, scope to the package(s) the user cares about rather than boiling the ocean; say what you scoped out.
- **Don't trust comments or names.** Verify behavior against the code.

## Reference index

- `references/analysis-playbook.md` — core: concrete grep/inspection techniques for each layer (routing, state, data, cross-cutting). Read for every job.
- `references/detection.md` — fingerprints to identify frameworks/libraries and confirm real usage.
- `references/onboarding.md` — architecture-guide output template.
- `references/migration.md` — modernization inventory, risk/effort framework.
- `references/audit.md` — security/perf/tech-debt checklist for React.
- `references/feature-tracing.md` — trace one feature end-to-end.
