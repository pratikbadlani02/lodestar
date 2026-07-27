# Analysis Playbook

Concrete techniques for each mapping phase. Adapt the grep patterns to the repo's actual conventions — these are starting points, not guarantees. Prefer `rg` (ripgrep) when available; fall back to `grep -rn`. Always exclude `node_modules`, `dist`, `build`.

## Table of contents
1. Entry & provider stack
2. Routing
3. Client state
4. Server state / data fetching
5. Backend contract
6. Cross-cutting concerns
7. Complexity & import graph

---

## 1. Entry & provider stack

Find the root render and read outward — the nesting order of providers tells you the subsystem hierarchy.

```bash
rg -l "createRoot|ReactDOM.render|hydrateRoot" src
rg -n "Provider|QueryClientProvider|ThemeProvider|BrowserRouter|RouterProvider|I18nextProvider|Auth0Provider" src/main.* src/index.* app/layout.* 2>/dev/null
```

Record the stack top-to-bottom; each entry maps to a phase below.

## 2. Routing

**Next.js App Router**: routes are the `app/` tree. `page.tsx` = route, `layout.tsx` = nesting, `route.ts` = API handler, `loading/error` = states.
```bash
find app -name "page.*" -o -name "route.*" | sort
```
**Next.js Pages Router**: `pages/` tree; `pages/api/` are API routes.
**react-router**: find the route tree.
```bash
rg -n "createBrowserRouter|<Routes|<Route|useRoutes|RouterProvider" src
```
**TanStack Router**: file-based (`routes/`) or code-based (`createRoute`).

Produce a table: `route path | component | lazy? | guard? | data loaded`.

## 3. Client (UI) state

Identify the library from inventory, then trace its real shape.

- **Redux / RTK**: find the store and slices.
  ```bash
  rg -n "configureStore|createSlice|createApi|combineReducers" src
  ```
  List slices, their state shape, and async thunks / RTK Query endpoints. RTK Query also covers server state — note that.
- **Zustand**: `rg -n "create\(" src | rg -i store` — each `create` is a store; list them.
- **Jotai/Recoil**: `rg -n "atom\(|atomFamily|selector\(" src` — atoms are the unit.
- **MobX**: `rg -n "makeObservable|makeAutoObservable|observer\(" src`.
- **Context-as-state**: `rg -n "createContext" src` then check which have non-trivial reducers/values.

Flag if more than one of these is in active use — it's a key finding (often a stalled migration).

## 4. Server state / data fetching

Where remote data enters and how it's cached.
```bash
rg -n "useQuery|useMutation|useInfiniteQuery|queryKey" src        # React Query
rg -n "useSWR" src                                                # SWR
rg -n "useQuery|useMutation|gql`|graphql\(" src                   # Apollo/urql/Relay
rg -n "axios|fetch\(|createApi" src                               # raw transport / RTK Query
```
Find the central client config (axios instance, ApolloClient, QueryClient) for base URL, interceptors, auth injection, retry/cache policy. Build: `data domain | hook/endpoint | cache strategy | invalidation`.

## 5. Backend contract

Enumerate what the frontend calls.
```bash
rg -n "https?://|/api/|baseURL|VITE_.*_URL|NEXT_PUBLIC_.*URL" src | rg -iv "\.png|\.svg|w3.org|schema"
rg -n "\.(get|post|put|patch|delete)\(" src
```
For GraphQL, collect operation names from `gql` tags or `.graphql` files. Map env-based switching:
```bash
rg -n "process\.env\.|import\.meta\.env\." src
cat .env* 2>/dev/null
```
Deliver an endpoint/operation inventory with call-site paths — the contract a rewrite must preserve.

## 6. Cross-cutting concerns

```bash
# Auth & route guards
rg -n "isAuthenticated|withAuth|ProtectedRoute|RequireAuth|getToken|Authorization" src
# Theming / design system
rg -n "ThemeProvider|createTheme|styled\(|tokens|theme\." src | head
# i18n
rg -n "useTranslation|t\(['\"]|i18n\.|FormattedMessage" src | head
# Feature flags
rg -n "useFlag|useFeature|LDProvider|flagsmith|growthbook|isEnabled" src
# Error handling & telemetry
rg -n "ErrorBoundary|componentDidCatch|Sentry|datadog|analytics|track\(" src
# Forms & validation
rg -n "useForm|<Formik|zodResolver|yupResolver|register\(|Controller" src | head
```
For each: is it centralized (one provider/util) or scattered (sprinkled per component)? That judgment is the deliverable, not the raw grep.

## 7. Complexity & import graph

Hot spots came from `inventory.mjs`. Expand into "what depends on what":
```bash
# crude in-degree: which modules are imported most
rg -o "from ['\"][.][^'\"]+['\"]" src | sort | uniq -c | sort -rn | head -30
```
For a real graph use `madge` if installable (`npx madge --circular --extensions ts,tsx src`) to find circular deps and orphan modules. Note TS strictness from `tsconfig.json` (`strict`, `noImplicitAny`) — it predicts hidden-bug surface.
