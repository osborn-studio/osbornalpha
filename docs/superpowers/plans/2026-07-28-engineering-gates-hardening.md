# Engineering Gates Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clear the three current high-severity npm advisories and replace the non-functional `next lint` script with a deterministic ESLint gate.

**Architecture:** Keep the application on the patched Next.js 15.5 backport line, while using npm overrides for the vulnerable PostCSS and Sharp transitive versions still pinned by Next.js. Add a native ESLint 10 flat configuration using the version-matched Next plugin, React Hooks rules, and the TypeScript parser without pulling the legacy `minimatch@3` compatibility chain. Declare Node `>=22.13.0 <23` as the runtime contract so the supported Node 22 line also satisfies ESLint 10. Retain `tsc --noEmit` as the separate blocking TypeScript correctness gate. Enabling TypeScript lint recommendations is deliberately deferred to a dedicated migration because its first baseline exposed 281 pre-existing explicit-`any` violations; bulk-editing those types is outside this engineering-gate repair.

**Tech Stack:** Next.js 15.5, npm overrides, ESLint 10, `@next/eslint-plugin-next`, `eslint-plugin-react-hooks`, `typescript-eslint`, TypeScript, Vitest.

---

### Task 1: Remove the high-severity dependency advisories

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Capture the failing security gate**

Run:

```bash
npm audit --audit-level=high
```

Expected: FAIL with three high-severity findings rooted at `next@15.5.20`, its nested `postcss@8.4.31`, and `sharp@0.34.x`.

- [x] **Step 2: Install the patched Next.js backport**

Run:

```bash
npm install next@15.5.22 --save-exact
```

Expected: `package.json` pins `next` to `15.5.22` and the lockfile resolves matching `@next/*` packages.

- [x] **Step 3: Override the still-vulnerable transitive packages**

Add this top-level field to `package.json`:

```json
"overrides": {
  "next": {
    "postcss": "8.5.19",
    "sharp": "0.35.0"
  }
}
```

Then run:

```bash
npm install
```

Expected: `npm ls next postcss sharp` shows `next@15.5.22`, Next's nested PostCSS resolved to `8.5.19`, and Sharp resolved to `0.35.0`.

- [x] **Step 4: Verify security and runtime compatibility**

Run:

```bash
npm audit --audit-level=high
npm test
npm run typecheck
npm run build
```

Expected: audit exits 0 with no high or critical vulnerabilities; 125 test files and 952 tests pass; typecheck and production build pass.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: patch Next.js transitive vulnerabilities"
```

### Task 2: Restore a deterministic ESLint gate

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Capture the broken lint gate**

Run:

```bash
npm run lint
```

Expected: FAIL because `next lint` is not a supported executable lint command in the current Next.js toolchain.

- [x] **Step 2: Install compatible lint dependencies**

Run:

```bash
npm install --save-dev eslint@10.8.0 @next/eslint-plugin-next@15.5.22 eslint-plugin-react-hooks@7.1.1 typescript-eslint@8.65.0
```

Expected: all four packages appear in `devDependencies`; the Next plugin matches the installed Next.js backport; `npm audit --audit-level=high` exits 0 without dependency overrides for lint packages.

- [x] **Step 3: Add the native flat configuration**

Create `eslint.config.mjs`:

```js
import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  globalIgnores(
    [
      ".next/**",
      ".worktrees/**",
      "coverage/**",
      "node_modules/**",
      "outputs/**",
      "playwright-report/**",
      "research-books/**",
      "test-results/**",
      "tmp/**",
    ],
  ),
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
      "react-hooks": reactHooks,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
  },
]);

export default eslintConfig;
```

- [x] **Step 4: Replace the obsolete package script**

Change the `lint` script in `package.json` to:

```json
"lint": "eslint . --max-warnings=0"
```

- [x] **Step 5: Verify the lint and application gates**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
git diff --check
```

Expected: all commands exit 0. Do not suppress project source findings or lower the recommended Core Web Vitals rules; correct every deterministic finding before committing. The separate `npm run typecheck` command remains mandatory.

- [x] **Step 6: Commit**

```bash
git add eslint.config.mjs package.json package-lock.json
git commit -m "chore: restore ESLint quality gate"
```

### Task 3: Verify the osstack repository contract

**Files:**
- Modify: `docs/superpowers/plans/2026-07-28-engineering-gates-hardening.md`

- [x] **Step 1: Run the declared repository gates**

Run:

```bash
npm run typecheck && npm run lint && npm test
npm run build
npm audit --audit-level=high
git diff --check
```

Expected: all commands exit 0; test output remains 125 files and 952 tests.

- [x] **Step 2: Record completion in this plan**

Mark every completed checkbox `[x]` only after its command has produced current evidence.

- [x] **Step 3: Commit the plan evidence**

```bash
git add docs/superpowers/plans/2026-07-28-engineering-gates-hardening.md
git commit -m "docs: record engineering gate verification"
```

### Verification Evidence (2026-07-28)

- Before dependency remediation, `npm audit --audit-level=high` exited 1 with three high-severity findings rooted at `next@15.5.20`, its nested `postcss@8.4.31`, and `sharp@0.34.x`.
- Before the ESLint repair, `npm run lint` exited 1 because the legacy `next lint` command could not provide a deterministic non-interactive gate and instead triggered configuration/failure.
- The subsequent dependency remediation was committed in `5b6be5f`; the successful ESLint gate was committed in `615b127`.
- Commit `10135b3` aligned `engines.node` to `>=22.13.0 <23`; verification used Node v22.19.0, which satisfies that declared runtime range.
- After `10135b3`, the complete repository gates were rerun successfully: the declared typecheck/lint/test command, production build, high-severity audit, dependency-tree inspection, and `git diff --check` all exited 0.
- `npm run typecheck && npm run lint && npm test` exited 0 with 125/125 test files and 952/952 tests passing.
- `npm run build` exited 0 and generated 34/34 static pages.
- `npm audit --audit-level=high` exited 0 with 0 vulnerabilities.
- `npm ls next postcss sharp eslint minimatch brace-expansion --all` exited 0: Next.js 15.5.22, Next's PostCSS 8.5.19 override, Sharp 0.35.0, ESLint 10.8.0, Minimatch 10.2.6, Brace Expansion 5.0.8, and `minimatch@3` count 0.
- `git diff --check` exited 0.
