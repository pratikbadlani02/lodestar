# Detection Fingerprints

Use to identify a framework/library and — crucially — confirm it is *actually used*, not just present in `package.json`. A dep with zero import sites is dead weight; report it as such.

## Confirming real usage

For any suspected library, count import sites:
```bash
rg -l "from ['\"]LIBRARY" src | wc -l     # files importing it
```
Zero in source (but present in deps) → likely stale/dead. Many → core. A handful → localized; note where.

## Meta-framework

| Signal | Framework |
|--------|-----------|
| `next` dep + `app/` with `page.tsx` | Next.js App Router |
| `next` dep + `pages/` | Next.js Pages Router |
| `@remix-run/*` or `remix` + `app/routes/` | Remix |
| `gatsby` + `gatsby-*.js` | Gatsby |
| `astro` + `.astro` files | Astro (React islands) |
| none of the above + a bundler config | plain SPA |

## Build tool

| Signal | Tool |
|--------|------|
| `vite` + `vite.config.*` | Vite |
| `react-scripts` | Create React App (likely legacy/unmaintained) |
| `webpack.config.*` + custom | hand-rolled webpack |
| `craco` | CRA with overrides |
| `@rsbuild/core` | Rsbuild |

CRA (`react-scripts`) is a migration red flag on its own — it's deprecated.

## State management

| Import signal | Library | Unit to map |
|--------------|---------|-------------|
| `@reduxjs/toolkit` `createSlice` | Redux Toolkit | slices, thunks, RTK Query endpoints |
| `redux` + `createStore` (no RTK) | legacy Redux | reducers, action types, sagas/thunks |
| `redux-saga` | Sagas | watcher/worker generators |
| `zustand` `create` | Zustand | stores |
| `jotai` `atom` | Jotai | atoms |
| `recoil` `atom`/`selector` | Recoil | atoms/selectors |
| `mobx` `makeAutoObservable` | MobX | observable stores |
| `xstate` `createMachine` | XState | state machines |

## Server state

| Signal | Library |
|--------|---------|
| `@tanstack/react-query` / `useQuery` | React Query |
| `swr` / `useSWR` | SWR |
| `@apollo/client` / `useQuery` from apollo | Apollo GraphQL |
| `urql` | urql GraphQL |
| `react-relay` | Relay |
| `createApi` from RTK | RTK Query |

## Styling

| Signal | Approach |
|--------|----------|
| `tailwindcss` + `tailwind.config` | Tailwind |
| `styled-components` / `@emotion` | CSS-in-JS |
| `@mui/material`, `antd`, `@chakra-ui`, `@mantine` | component library |
| `.module.css` files | CSS Modules |
| `@vanilla-extract` | zero-runtime CSS-in-TS |

## Auth

| Signal | Provider |
|--------|----------|
| `@auth0/auth0-react` | Auth0 |
| `next-auth` / `@auth/*` | NextAuth/Auth.js |
| `@clerk/*` | Clerk |
| `@azure/msal-react` | Azure AD / Entra |
| `@okta/okta-react` | Okta |
| `aws-amplify` / `@aws-amplify/ui-react` | Cognito/Amplify |
| custom `Authorization: Bearer` + token store | hand-rolled JWT |
