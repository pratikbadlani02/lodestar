#!/usr/bin/env node
/**
 * inventory.mjs — deterministic first-pass inventory of a React codebase.
 *
 * Zero dependencies. Run from anywhere:
 *   node inventory.mjs [repoRoot] [--json out.json] [--quiet]
 *
 * It detects the build/meta framework, categorizes dependencies, gathers
 * structural stats (file counts, biggest files, route/component/test hints),
 * and prints a Markdown summary to stdout plus optional JSON. Treat the output
 * as a factual baseline to anchor analysis — never as the analysis itself.
 */

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const root = path.resolve(args.find((a) => !a.startsWith("-")) || ".");
const jsonOutIdx = args.indexOf("--json");
const jsonOut = jsonOutIdx !== -1 ? args[jsonOutIdx + 1] : null;
const quiet = args.includes("--quiet");

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".turbo",
  "coverage", ".cache", ".parcel-cache", "storybook-static", ".vercel",
  ".netlify", "__snapshots__", ".idea", ".vscode",
]);
const SRC_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const MAX_FILES = 60000; // safety cap for very large monorepos

// dep name -> human category. First match wins per category in report.
const LIB_CATEGORIES = {
  "meta-framework": ["next", "gatsby", "@remix-run/react", "remix", "@redwoodjs/core", "astro", "@builder.io/qwik"],
  "build-tool": ["vite", "webpack", "parcel", "@parcel/core", "esbuild", "rollup", "@swc/core", "@rsbuild/core", "react-scripts"],
  "language": ["typescript"],
  "routing": ["react-router", "react-router-dom", "@tanstack/react-router", "wouter", "@reach/router"],
  "client-state": ["@reduxjs/toolkit", "redux", "react-redux", "zustand", "mobx", "mobx-react", "mobx-react-lite", "recoil", "jotai", "valtio", "xstate", "@xstate/react"],
  "server-state": ["@tanstack/react-query", "react-query", "swr", "@apollo/client", "urql", "@urql/core", "relay-runtime", "react-relay"],
  "data-transport": ["axios", "graphql", "graphql-request", "ky", "got", "superagent"],
  "styling": ["styled-components", "@emotion/react", "@emotion/styled", "tailwindcss", "sass", "less", "@stitches/react", "@vanilla-extract/css", "@mui/material", "@material-ui/core", "antd", "@chakra-ui/react", "@mantine/core", "react-bootstrap", "bootstrap", "@radix-ui/react-dialog"],
  "forms": ["react-hook-form", "formik", "final-form", "react-final-form"],
  "validation": ["zod", "yup", "joi", "superstruct", "ajv"],
  "i18n": ["react-i18next", "i18next", "react-intl", "@lingui/core", "next-i18next", "@formatjs/intl"],
  "testing": ["jest", "vitest", "@testing-library/react", "cypress", "@playwright/test", "enzyme", "msw", "@storybook/react", "@storybook/react-vite"],
  "auth": ["@auth0/auth0-react", "next-auth", "@clerk/clerk-react", "@clerk/nextjs", "firebase", "aws-amplify", "@aws-amplify/ui-react", "@okta/okta-react", "oidc-client-ts", "react-oidc-context", "@azure/msal-react"],
  "feature-flags": ["launchdarkly-react-client-sdk", "@optimizely/react-sdk", "flagsmith", "@unleash/proxy-client-react", "@growthbook/growthbook-react", "configcat-react"],
  "monitoring": ["@sentry/react", "@sentry/nextjs", "@datadog/browser-rum", "react-ga", "react-ga4", "mixpanel-browser", "@amplitude/analytics-browser", "posthog-js", "@bugsnag/js"],
  "realtime": ["socket.io-client", "pusher-js", "@microsoft/signalr", "ably", "phoenix"],
  "tables": ["@tanstack/react-table", "react-table", "ag-grid-react", "@mui/x-data-grid"],
  "charts": ["recharts", "d3", "chart.js", "react-chartjs-2", "victory", "@nivo/core", "plotly.js", "@visx/visx", "highcharts"],
};

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; }
}

// ---- walk ----
const files = [];
let truncated = false;
function walk(dir) {
  if (files.length >= MAX_FILES) { truncated = true; return; }
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (files.length >= MAX_FILES) { truncated = true; return; }
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name) || e.name.startsWith(".") && e.name !== ".") continue;
      walk(path.join(dir, e.name));
    } else if (e.isFile()) {
      files.push(path.join(dir, e.name));
    }
  }
}
walk(root);

// ---- package.json discovery (root + workspaces) ----
const pkgPaths = files.filter((f) => path.basename(f) === "package.json");
const rootPkg = readJSON(path.join(root, "package.json")) || {};
const allDeps = {};
for (const p of pkgPaths) {
  const pkg = readJSON(p);
  if (!pkg) continue;
  Object.assign(allDeps, pkg.dependencies, pkg.devDependencies, pkg.peerDependencies);
}

// ---- monorepo detection ----
const monorepo = {
  isMonorepo: false,
  tool: null,
  packageJsonCount: pkgPaths.length,
};
if (Array.isArray(rootPkg.workspaces) || (rootPkg.workspaces && rootPkg.workspaces.packages)) {
  monorepo.isMonorepo = true; monorepo.tool = "npm/yarn workspaces";
}
if (files.some((f) => path.basename(f) === "pnpm-workspace.yaml")) { monorepo.isMonorepo = true; monorepo.tool = "pnpm workspaces"; }
if (files.some((f) => path.basename(f) === "lerna.json")) { monorepo.isMonorepo = true; monorepo.tool = "lerna"; }
if (files.some((f) => path.basename(f) === "nx.json")) { monorepo.isMonorepo = true; monorepo.tool = "nx"; }
if (files.some((f) => path.basename(f) === "turbo.json")) { monorepo.isMonorepo = true; monorepo.tool = "turborepo"; }
if (pkgPaths.length > 1 && !monorepo.isMonorepo) { monorepo.isMonorepo = true; monorepo.tool = "multiple package.json (unconfigured?)"; }

// ---- package manager ----
let pkgManager = "unknown";
if (files.some((f) => path.basename(f) === "pnpm-lock.yaml")) pkgManager = "pnpm";
else if (files.some((f) => path.basename(f) === "yarn.lock")) pkgManager = "yarn";
else if (files.some((f) => path.basename(f) === "bun.lockb")) pkgManager = "bun";
else if (files.some((f) => path.basename(f) === "package-lock.json")) pkgManager = "npm";

// ---- categorize libraries ----
const libsByCategory = {};
for (const [cat, names] of Object.entries(LIB_CATEGORIES)) {
  const found = names.filter((n) => allDeps[n]).map((n) => ({ name: n, version: allDeps[n] }));
  if (found.length) libsByCategory[cat] = found;
}

// ---- framework summary ----
const framework = (libsByCategory["meta-framework"]?.[0]?.name) || null;
const buildTool = (libsByCategory["build-tool"]?.[0]?.name) || null;
const isTS = !!allDeps["typescript"];

// ---- file stats ----
const byExt = {};
let srcFileCount = 0;
const sizes = []; // {path, loc}
for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  byExt[ext] = (byExt[ext] || 0) + 1;
  if (SRC_EXT.has(ext)) {
    srcFileCount++;
    try {
      const loc = fs.readFileSync(f, "utf8").split("\n").length;
      sizes.push({ path: path.relative(root, f), loc });
    } catch { /* ignore unreadable */ }
  }
}
sizes.sort((a, b) => b.loc - a.loc);
const totalLoc = sizes.reduce((s, x) => s + x.loc, 0);

// ---- hints (cheap heuristics; deep extraction belongs in the playbook) ----
const componentFiles = files.filter((f) => /\.(jsx|tsx)$/.test(f)).length;
const testFiles = files.filter((f) => /\.(test|spec)\.(jsx?|tsx?)$/.test(f) || /(^|\/)__tests__\//.test(f)).length;
const storyFiles = files.filter((f) => /\.stories\.(jsx?|tsx?|mdx)$/.test(f)).length;

let routeHints = { strategy: "unknown", evidence: [] };
const hasNextApp = files.some((f) => /(^|\/)app\/(.*\/)?(page|layout)\.(jsx?|tsx?)$/.test(path.relative(root, f)));
const hasNextPages = files.some((f) => /(^|\/)pages\//.test(path.relative(root, f)) && /\.(jsx?|tsx?)$/.test(f));
if (framework === "next" && hasNextApp) { routeHints = { strategy: "Next.js App Router", evidence: ["app/.../page.tsx present"] }; }
else if (framework === "next" && hasNextPages) { routeHints = { strategy: "Next.js Pages Router", evidence: ["pages/ directory present"] }; }
else if (libsByCategory["routing"]) { routeHints = { strategy: libsByCategory["routing"][0].name, evidence: ["routing library in deps"] }; }

// ---- env / config surface ----
const configFiles = files
  .map((f) => path.relative(root, f))
  .filter((f) =>
    /(^|\/)(\.env(\.|$)|vite\.config\.|next\.config\.|webpack\.config\.|tsconfig|babel\.config\.|\.eslintrc|tailwind\.config\.|jest\.config\.|vitest\.config\.|playwright\.config\.|\.storybook\/)/.test(f)
  )
  .slice(0, 40);

const report = {
  root,
  scannedAt: new Date().toISOString(),
  truncated,
  packageManager: pkgManager,
  monorepo,
  framework,
  buildTool,
  typescript: isTS,
  rootScripts: rootPkg.scripts || {},
  libsByCategory,
  stats: {
    totalFiles: files.length,
    sourceFiles: srcFileCount,
    componentFiles,
    testFiles,
    storyFiles,
    totalSourceLoc: totalLoc,
    byExtensionTop: Object.fromEntries(Object.entries(byExt).sort((a, b) => b[1] - a[1]).slice(0, 12)),
  },
  largestSourceFiles: sizes.slice(0, 20),
  routeHints,
  configFiles,
  dependencyCount: Object.keys(allDeps).length,
};

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
}

if (!quiet) {
  const L = [];
  const cat = (c) => (libsByCategory[c] ? libsByCategory[c].map((x) => x.name).join(", ") : "—");
  L.push(`# React Repo Inventory`);
  L.push(``);
  L.push(`Root: \`${report.root}\`${truncated ? "  ⚠️ file scan truncated (very large repo)" : ""}`);
  L.push(``);
  L.push(`## Stack`);
  L.push(`- Meta/framework: **${framework || "plain React (no meta-framework)"}**`);
  L.push(`- Build tool: **${buildTool || "unknown — inspect config files"}**`);
  L.push(`- Language: **${isTS ? "TypeScript" : "JavaScript"}**`);
  L.push(`- Package manager: **${pkgManager}**`);
  L.push(`- Monorepo: **${monorepo.isMonorepo ? `yes (${monorepo.tool}, ${monorepo.packageJsonCount} package.json)` : "no"}**`);
  L.push(`- Routing: **${routeHints.strategy}**`);
  L.push(``);
  L.push(`## Library landscape`);
  for (const c of ["routing", "client-state", "server-state", "data-transport", "styling", "forms", "validation", "i18n", "auth", "feature-flags", "monitoring", "realtime", "tables", "charts", "testing"]) {
    L.push(`- ${c}: ${cat(c)}`);
  }
  L.push(``);
  L.push(`## Size`);
  L.push(`- Source files: **${srcFileCount}** (${componentFiles} .jsx/.tsx), total **${totalLoc.toLocaleString()}** LOC`);
  L.push(`- Tests: **${testFiles}**, Stories: **${storyFiles}**, Deps: **${report.dependencyCount}**`);
  L.push(``);
  L.push(`## Largest source files (LOC) — likely complexity hot spots`);
  for (const f of report.largestSourceFiles.slice(0, 12)) L.push(`- ${f.loc} — \`${f.path}\``);
  L.push(``);
  L.push(`## Build/config surface`);
  for (const f of configFiles.slice(0, 20)) L.push(`- \`${f}\``);
  L.push(``);
  L.push(`## npm scripts`);
  for (const [k, v] of Object.entries(report.rootScripts)) L.push(`- \`${k}\`: ${v}`);
  console.log(L.join("\n"));
}
