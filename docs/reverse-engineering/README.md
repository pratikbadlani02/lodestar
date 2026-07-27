# Reverse-Engineering the Lodestar Frontend

Produced with the `reverse-engineer-react` skill ([.github/skills/reverse-engineer-react/SKILL.md](../../.github/skills/reverse-engineer-react/SKILL.md)). One shared architecture map (Steps 1–7) was built first, then each goal-specific deliverable was layered on top.

**One-paragraph summary.** Lodestar's frontend is a single-page **React 18 + Vite** dashboard (plain JavaScript, no TypeScript, no meta-framework) for an autonomous quant-trading platform. It is a ~19k-LOC, 73-file SPA that talks to a FastAPI backend over a hand-rolled `fetch` wrapper and a single WebSocket, with **Zustand** holding live trading state and four React Contexts holding UI preferences. Its single biggest architectural characteristic: **the WebSocket is an invalidation bus, not a data channel** — WS messages trigger REST re-fetches into the store rather than writing state directly, keeping the server authoritative.

## Inventory baseline (Step 1)

| Fact | Value | Source |
|---|---|---|
| Framework | React `^18.3.0`, no meta-framework | [frontend/package.json](../../frontend/package.json#L11-L18) |
| Language | JavaScript (ESM, `.jsx`) — **no TypeScript** | [frontend/package.json](../../frontend/package.json#L4) |
| Build tool | Vite `^5.3.0` + `@vitejs/plugin-react` | [frontend/package.json](../../frontend/package.json#L20-L26) |
| Router | `react-router-dom` `^6.26.0` | [frontend/package.json](../../frontend/package.json#L15) |
| Client state | `zustand` `^5.0.13` + 4 React Contexts | [frontend/package.json](../../frontend/package.json#L17) |
| Server-state lib | **none** (hand-rolled `fetch`) | [frontend/src/lib/api.js](../../frontend/src/lib/api.js#L16-L46) |
| Styling | Tailwind `^3.4.19` | [frontend/package.json](../../frontend/package.json#L24) |
| Charts | `recharts`, `lightweight-charts` | [frontend/package.json](../../frontend/package.json#L11-L16) |
| Size | 73 source files, 60 `.jsx`, **19,132 LOC** | inventory.mjs |
| Tests | **0** | inventory.mjs |
| Deps | 8 runtime, 5 dev | [frontend/package.json](../../frontend/package.json#L10-L27) |

## Deliverables

| # | Goal | Document |
|---|------|----------|
| 1 | Onboarding / architecture guide | [onboarding.md](onboarding.md) |
| 2 | Audit (security / perf / tech-debt) | [audit.md](audit.md) |
| 3 | Migration / modernization plan | [migration.md](migration.md) |
| 4 | Feature trace — order placement | [feature-trace-order-placement.md](feature-trace-order-placement.md) |

> ℹ️ A separate, older doc set exists under [docs/frontend-analysis/](../frontend-analysis/01-architecture.md), produced by a different (table-first, 9-document) skill. This set is the `reverse-engineer-react` skill's goal-based output and is independent of it.
