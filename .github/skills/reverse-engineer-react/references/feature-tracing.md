# Feature Tracing Deliverable

Goal: understand one feature deeply enough to replicate or rebuild it — every layer it touches, end to end. Use when the user points at a specific behavior ("how does the export-to-CSV work", "replicate the onboarding wizard").

## Procedure

1. **Find the entry point.** Start from what the user sees and search for it: button label, route, test id, or feature name.
   ```bash
   rg -n "feature label text|data-testid=\"...\"|/route-path" src
   ```
2. **Follow the call chain downward.** From the component: which handler fires, which hook/action it calls, which store/query it touches, which API it hits. Record each hop with its file path.
3. **Map the data round-trip.** Request shape -> endpoint -> response shape -> where it lands in state -> how it re-renders. Note caching/invalidation.
4. **Capture the side-effects.** Navigation, toasts, analytics events, optimistic updates, error handling, loading states, permission checks.
5. **Note the dependencies.** Shared utils, design-system components, context/providers the feature relies on — these must come along when replicating.

## Output

```markdown
# Feature: <name>

## Summary
What it does, in two sentences.

## Trigger
Where/how it starts (component + path).

## Flow
A numbered call chain or Mermaid sequence diagram:
UI event -> handler -> hook/action -> API -> state update -> re-render.
Each step cites a file path.

## Data
Request and response shapes; where state is held; cache behavior.

## Dependencies to bring along
Shared components, hooks, utils, providers, env/config, backend endpoints.

## Edge cases & states
Loading, empty, error, permission-denied, optimistic/rollback.

## To replicate
The minimal set of pieces to reproduce this behavior elsewhere, in order.
```

## Quality bar
- The flow is a real, traceable chain of file paths, not a generic description.
- Backend endpoints the feature needs are named explicitly.
- Edge cases and error states are covered — they're usually half the real code.
