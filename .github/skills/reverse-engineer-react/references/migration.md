# Migration / Modernization Deliverable

Goal: a defensible plan to move off (or modernize) the current app — what exists, what must be preserved, what it'll cost, and in what order. Connects directly to the mapping phases; the API contract (Step 5) and state map (Step 4) are the load-bearing inputs.

## 1. Establish the target
Confirm the destination before estimating. Common moves: CRA -> Vite, Pages Router -> App Router, Redux -> RTK/Zustand, JS -> TS, class -> function components, REST -> GraphQL, or a full rewrite in a new framework. The target dictates which parts of the map matter most.

## 2. Preservation inventory (what cannot break)
The behavioral contract that must survive the migration:
- **API contract** — every endpoint/operation and its shape (from Step 5). This is the spec for the new app.
- **Routes & URLs** — externally-linked URLs that must keep resolving.
- **Business logic** — validation rules, calculations, workflows. Locate and catalog these; they're the actual value, separate from framework plumbing.
- **Auth & permissions** — the access model.

## 3. Component / module inventory with effort
Table each significant module:

| Module | LOC | Depends on | Migration type | Risk | Effort |
|--------|-----|-----------|----------------|------|--------|

- **Migration type**: lift-and-shift / refactor / rewrite / drop (dead).
- **Risk**: low / med / high — driven by coupling, lack of tests, framework-specific APIs, and business-criticality.
- **Effort**: relative sizing (S/M/L or points) — calibrate against the LOC and dependency data from inventory.

## 4. Dependency risk
- Deprecated/unmaintained packages (CRA `react-scripts`, Enzyme, legacy redux middleware) — these often force the schedule.
- Libraries with no clean equivalent in the target — call out early.
- Peer-dependency conflicts with the target framework version.

## 5. Migration strategy & sequence
Recommend an approach and justify it:
- **Strangler-fig / incremental** (route-by-route or feature-by-feature behind a router or module federation) — lower risk, preferred for large apps.
- **Big-bang rewrite** — only when the app is small or so degraded that incremental is harder.

Then give a phased sequence: foundation (tooling, TS, shared utils) -> low-risk leaf features -> shared/core -> high-risk hot spots last. Note what unblocks what.

## 6. Risks & unknowns
Explicit list of what could blow up the estimate: untested critical paths, hidden backend coupling, undocumented business rules, areas where the code's intent is genuinely unclear. Honesty here is the deliverable's credibility.

## Quality bar
- The preservation inventory is exhaustive on the API contract — a missed endpoint is a production incident.
- Every effort estimate traces to evidence (LOC, dependency count, test presence), not vibes.
- Dead code is identified and marked "drop" so nobody migrates it.
