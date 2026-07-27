# Onboarding Deliverable

Goal: a new engineer reads this and can navigate and make a first change with confidence. Write it as a Markdown doc (`ARCHITECTURE.md` or similar). Concrete, path-anchored, skimmable.

## Template

```markdown
# <App name> — Architecture Guide

## 1. What this app is
One paragraph: what it does, who uses it, the stack in one line.

## 2. Stack at a glance
Framework, build tool, language, package manager, state, data, styling, auth,
i18n — from the inventory. One line each.

## 3. Run it locally
The exact commands (from package.json scripts), required env vars (from .env
inspection), and any backend/services it needs.

## 4. Big picture
A Mermaid diagram of the provider stack and/or top-level route map.
Then 3–6 sentences on how a request flows: route -> component -> data hook ->
API -> render.

## 5. Directory map
A table: top-level dirs -> what lives there -> when you'd touch it.

## 6. Subsystems
One short subsection each for routing, state, data fetching, auth, styling,
i18n, error handling — each with: how it works here, the key files, and the
pattern to follow when extending it.

## 7. Conventions
Naming, file structure, where tests go, lint/format rules — the unwritten rules
made explicit.

## 8. Gotchas & landmines
The surprising stuff: coexisting patterns, dead code, fragile areas, anything
that violates the obvious expectation. This section earns the most goodwill.

## 9. Where to start
"To add a new page, do X. To add a new API call, do Y." Two or three worked
first-tasks pointing at real example files.
```

## Quality bar
- Every subsystem section names at least one real file path to open.
- Include one Mermaid diagram minimum.
- The gotchas section is non-empty — every inherited enterprise app has them; if you found none, you didn't look hard enough.
- Prefer "open `src/api/client.ts:42`" over abstract description.
