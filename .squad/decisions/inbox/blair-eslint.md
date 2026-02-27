# ESLint Configuration Decision

**Date:** 2026-02-27  
**Author:** Blair (Extension Dev)  
**Context:** Issue #22 — Add ESLint with TypeScript support for code quality

---

## Decision

Implemented ESLint with TypeScript support using flat config format (eslint.config.mjs). Configured VS Code extension-appropriate rules with relaxed settings for test files.

### Configuration Details

**Format:** ESM flat config (`eslint.config.mjs`) — matches existing esbuild.config.mjs convention

**Packages installed:**
- `eslint` (core linter)
- `@typescript-eslint/parser` (TypeScript parsing)
- `@typescript-eslint/eslint-plugin` (TypeScript-specific rules)

**Rules:**
- Base: TypeScript recommended rules
- `@typescript-eslint/no-unused-vars`: error, with underscore prefix exception (`_variable`) for intentionally unused
- `consistent-return`: error (all code paths must return consistently)
- `no-console`: warn (extensions shouldn't console.log in production)
- `@typescript-eslint/no-explicit-any`: warn (not error — SDK uses `any` types)
- Explicit return types: OFF (too verbose for extension code)

**Test file overrides:**
- `no-console`: OFF (test files can log)
- `@typescript-eslint/no-explicit-any`: OFF (mocks often need `any`)

**Exclusions:**
- `node_modules/**`
- `dist/**`
- `.squad/**`
- `**/*.js`, `**/*.mjs` (only lint .ts files)

### Scripts

- **`npm run lint`**: ESLint check on `src/` (new)
- **`npm run lint:types`**: TypeScript type check with `tsc --noEmit` (renamed from old `lint`)

### Fixes Applied

Fixed 1 violation in existing code:
- `src/test/error-scenarios.test.ts`: Prefixed unused import `removeSession` with underscore (`_removeSession`)

---

## Rationale

1. **Flat config format** — ESLint 9.x+ recommendation, matches project's ESM style (esbuild.config.mjs, vitest.config.mts)
2. **Underscore exception** — Common pattern for "this parameter exists but I don't use it" (e.g., mocks, function signatures)
3. **no-console as warning** — Allows console.log during development, but flags for review before merge
4. **Relaxed test rules** — Test code needs flexibility for mocks, assertions, debug logging
5. **Exclude .squad/** — Dev tooling shouldn't be linted
6. **Renamed old lint script** — TypeScript type checking is still valuable, but distinct from ESLint

---

## What This Enables

1. **Consistent code style** — TypeScript recommended rules catch common bugs
2. **Prevent unused vars** — Catch dead code, but allow intentional unused with `_` prefix
3. **Enforce return consistency** — All code paths return or all throw (no mixed behavior)
4. **CI-ready** — `npm run lint` can run in GitHub Actions to block PRs with violations
5. **Separate concerns** — ESLint for style/bugs, TypeScript for types

---

## Next Steps

1. **Add to CI** — Run `npm run lint` in GitHub Actions workflow (future work, not in MVP scope)
2. **Monitor SDK types** — When @github/copilot-sdk exports proper types, revisit `no-explicit-any` warnings
3. **Team adoption** — Squad members should run `npm run lint` before pushing

---

## Why This Matters

ESLint catches bugs that TypeScript misses (unused vars, inconsistent returns, console.log in production). The flat config format is future-proof and aligns with ESM module conventions used throughout the project.
