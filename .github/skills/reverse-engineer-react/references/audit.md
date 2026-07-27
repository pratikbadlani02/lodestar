# Audit Deliverable

Goal: a prioritized findings report for a codebase the user owns or maintains — security weaknesses, performance problems, and tech debt — each with a file path, why it matters, and a fix direction. This is a defensive review to harden the app, not offensive tooling.

Group findings by severity (Critical / High / Medium / Low) and report as: finding, location, impact, recommendation.

## Security (client-side scope)
Frontend audits cover what the client controls; flag backend-dependent issues but note they need server verification.
```bash
rg -n "dangerouslySetInnerHTML" src                         # XSS surface
rg -n "eval\(|new Function\(|innerHTML\s*=" src             # dynamic execution
rg -n "localStorage|sessionStorage|document\.cookie" src     # token storage exposure
rg -n "(api[_-]?key|secret|password|token)\s*[:=]\s*['\"]" src  # hardcoded secrets
rg -n "http://" src                                          # non-TLS endpoints
```
Check for: secrets committed to the repo or baked into the bundle (anything in `VITE_`/`NEXT_PUBLIC_` ships to the client — flag sensitive values), tokens in `localStorage` (XSS-readable), unsanitized HTML injection, missing auth guards on sensitive routes, and outdated deps with known CVEs (`npm audit` / check `npm audit --json`). Never write exploit code — describe the weakness and the remediation.

## Performance
```bash
rg -n "import .* from ['\"](lodash|moment|@mui/icons-material)['\"]" src   # heavy/whole-lib imports
rg -n "useEffect\(" src | wc -l                                            # effect density
rg -n "React.lazy|dynamic\(|loadable\(" src | wc -l                        # code-splitting usage
```
Look for: missing code-splitting (everything in one bundle), barrel/whole-library imports inflating bundle size, missing memoization on expensive renders, unkeyed or poorly-keyed lists, large synchronous work on mount, unoptimized images, and no `React.memo`/`useMemo` where the inventory shows heavy components. If buildable, inspect actual bundle size (`vite build` / `next build` output, or a bundle analyzer) — measured beats guessed.

## Tech debt & quality
```bash
rg -n "TODO|FIXME|HACK|XXX|@ts-ignore|@ts-expect-error|eslint-disable" src | wc -l
rg -n ": any\b" src | wc -l                                  # TS escape hatches
```
Assess: test coverage and kind, TypeScript strictness (`tsconfig` `strict`), `any` density, suppressed errors/lint rules, circular dependencies (`npx madge --circular`), dead code (zero-import modules), duplicated logic, coexisting competing patterns, and deprecated framework APIs (CRA, class lifecycles, legacy context).

## Quality bar
- Every finding has a path and a concrete fix direction, not just "improve X".
- Severity reflects real impact (a hardcoded prod secret outranks a missing `useMemo`).
- Separate "confirmed in code" from "needs runtime/server confirmation."
- Output is remediation-oriented; no exploit payloads.
