# Build & Dependency Review — Palmer

## Summary

The build toolchain (esbuild, vitest, TypeScript) is solid and well-configured. However, **all four CI/CD workflows are fundamentally broken** — they use `node --test test/*.test.js` (Node's built-in test runner against a non-existent `test/` directory) instead of `npm test` (vitest against `src/test/**/*.test.ts`), and they skip `npm ci`, `npm run build`, linting, and type-checking entirely. The release workflows also don't produce a `.vsix` artifact, meaning releases are tags without a distributable extension.

## Findings

### 🔴 Critical: CI test command targets wrong runner and wrong path

- **Location:** `.github/workflows/squad-ci.yml:24`, `squad-release.yml:23`, `squad-preview.yml:30`, `squad-insider-release.yml:23`
- **Category:** CI-CD
- **Description:** All four workflows run `node --test test/*.test.js` but the project uses vitest with tests at `src/test/**/*.test.ts`. There is no `test/` directory. This command silently succeeds with zero tests or fails with a glob miss — either way, **no tests are actually executed in CI**.
- **Impact:** PRs merge with zero test validation. Regressions ship undetected. The 198 vitest tests (all passing locally) provide no CI gate.
- **Remediation:** Replace `node --test test/*.test.js` with `npm test` in all four workflows.

### 🔴 Critical: CI workflows skip dependency installation

- **Location:** `.github/workflows/squad-ci.yml`, `squad-release.yml`, `squad-preview.yml`, `squad-insider-release.yml`
- **Category:** CI-CD
- **Description:** None of the four workflows include an `npm ci` or `npm install` step. After `actions/checkout` and `actions/setup-node`, they jump straight to running tests — but `node_modules/` doesn't exist in a fresh CI runner.
- **Impact:** Even if the test command were correct, it would fail because vitest (and all other deps) aren't installed. The current broken test command may accidentally mask this by matching zero files.
- **Remediation:** Add `npm ci` step after `actions/setup-node` in all workflows.

### 🟠 High: CI lacks build, lint, and typecheck steps

- **Location:** `.github/workflows/squad-ci.yml`
- **Category:** CI-CD
- **Description:** The CI workflow only attempts to run tests. It does not run `npm run build` (esbuild), `npm run lint` (eslint), or `npx tsc --noEmit` (type-checking). The project has all three configured and working locally.
- **Impact:** Type errors, lint violations, and build failures can merge to `dev` undetected. TypeScript strict mode provides no value if CI doesn't enforce it.
- **Remediation:** Add steps to `squad-ci.yml`:
  ```yaml
  - run: npm ci
  - run: npm run build
  - run: npm run lint
  - run: npx tsc --noEmit
  - run: npm test
  ```

### 🟠 High: Release workflows don't build or publish .vsix artifact

- **Location:** `.github/workflows/squad-release.yml`, `squad-insider-release.yml`
- **Category:** CI-CD
- **Description:** Release workflows create git tags and GitHub Releases, but never run `npm run package` (which runs esbuild + `vsce package`) and never attach a `.vsix` file to the release. The `@vscode/vsce` dev dependency is installed but unused in CI.
- **Impact:** Users cannot download a ready-to-install extension from any GitHub Release. The release is just a tagged commit with auto-generated notes.
- **Remediation:** Add to release workflows:
  ```yaml
  - run: npm ci
  - run: npm run package
  - name: Upload .vsix
    run: gh release upload "$TAG" *.vsix
  ```

### 🟡 Medium: Endpoint config example includes path SDK auto-appends

- **Location:** `package.json:99` — `forge.copilot.endpoint` description
- **Category:** Manifest
- **Description:** The endpoint setting's example URL is `https://myresource.openai.azure.com/openai/v1/` but the SDK with `type: "azure"` auto-appends `/openai/v1/` to the `baseUrl`. Users following this example will get a doubled path (`/openai/v1/openai/v1/`), causing 404 errors.
- **Impact:** Users following the documented example will get connection failures on first use.
- **Remediation:** Change the example to `https://myresource.openai.azure.com/` and add a note that the SDK appends the API path automatically. Alternatively, strip any trailing `/openai/v1/` in code before passing to the SDK.

### 🟡 Medium: Missing extension marketplace metadata

- **Location:** `package.json` (top-level fields)
- **Category:** Manifest
- **Description:** The extension manifest is missing several fields recommended for VS Code Marketplace publishing: `icon` (PNG for marketplace — the SVG at `resources/icon.svg` is used for the activity bar but marketplace requires a 128x128 PNG), `keywords`, `extensionKind` (should be `["workspace"]` for a backend extension), and `preview` (should be `true` for v0.x).
- **Impact:** Marketplace listing will appear incomplete. Missing `extensionKind` means VS Code defaults may cause the extension to load in incorrect contexts (e.g., web).
- **Remediation:** Add to `package.json`:
  ```json
  "icon": "resources/icon.png",
  "keywords": ["ai", "chat", "azure", "copilot", "air-gap"],
  "extensionKind": ["workspace"],
  "preview": true
  ```

### 🟡 Medium: tsconfig.json emits declarations unnecessarily

- **Location:** `tsconfig.json:10` — `"declaration": true`
- **Category:** TypeScript
- **Description:** `declaration: true` generates `.d.ts` files, but esbuild handles bundling (not tsc), and `tsc --noEmit` is the typecheck command. The extension is not a library consumed by other packages. This setting has no practical effect since `tsc --noEmit` skips output, but it's misleading.
- **Impact:** Low — no functional impact since `--noEmit` is always used. However, if someone runs `tsc` without `--noEmit`, it would emit unnecessary `.d.ts` files into `dist/`.
- **Remediation:** Remove `"declaration": true` from `tsconfig.json` or add `"noEmit": true` to make the intent explicit.

### 🟢 Low: Dev source maps may leak into .vsix packages

- **Location:** `esbuild.config.mjs:43`, `esbuild.config.mjs:56`
- **Category:** Build
- **Description:** Dev builds generate `.map` files in `dist/`. The `package` script runs `--production` which doesn't generate new maps, but doesn't clean old ones either. If a developer runs `npm run build` (dev) then `npm run package`, stale `.map` files (2.8MB) will be included in the `.vsix`.
- **Impact:** Bloated `.vsix` package with source maps that expose unminified source code.
- **Remediation:** Add a clean step to the `package` script:
  ```json
  "package": "rm -rf dist && npm run build -- --production && vsce package"
  ```
  Or add a `.vscodeignore` entry for `dist/*.map`.

### 🟢 Low: DevContainer Node version vs engines field

- **Location:** `.devcontainer/devcontainer.json:2`, `package.json:14`
- **Category:** DevContainer
- **Description:** DevContainer uses Node 22 (`typescript-node:1-22-bookworm`), while `package.json` specifies `engines.node: ">=20.19.0"`. CI also uses Node 22. This is fine — 22 satisfies >=20.19.0 — but developers may not be testing on the minimum supported version.
- **Impact:** Minimal. Node 22 is the practical target and the LTS version. Features from Node 22 that don't exist in 20.19 could slip in, but the gap is narrow.
- **Remediation:** Consider setting `engines.node` to `">=22.0.0"` to match the actual tested version, or add a CI matrix for Node 20 if v20 support is intentional.

### 🟢 Low: No npm audit step in CI

- **Location:** `.github/workflows/squad-ci.yml`
- **Category:** CI-CD / Dependencies
- **Description:** CI workflows don't run `npm audit` to detect known vulnerabilities. Current audit is clean (0 vulnerabilities), but automated checks prevent regressions.
- **Impact:** Vulnerable dependencies could be introduced via PRs without detection.
- **Remediation:** Add `npm audit --audit-level=moderate` step to `squad-ci.yml`.

### ℹ️ Info: Build toolchain is well-designed

- **Location:** `esbuild.config.mjs`
- **Category:** Build
- **Description:** The dual-bundle architecture (extension + webview) is clean. Source maps and minification are correctly toggled by the `--production` flag. The `import.meta.resolve` shim is a necessary workaround for CJS bundling of the Copilot SDK. All dependencies are actively used: `@azure/identity` (auth), `@github/copilot-sdk` (core), `marked` (markdown rendering in webview), `dompurify` (XSS protection in webview).
- **Impact:** Positive — solid foundation.
- **Remediation:** None needed.

### ℹ️ Info: Bundle size is healthy

- **Location:** `dist/`
- **Category:** Bundle
- **Description:** Production bundle: extension.js = 528KB, chat.js = 76KB. Total: 604KB minified, no source maps. This is reasonable for a VS Code extension bundling the Copilot SDK, Azure Identity SDK, marked, and DOMPurify. Dev bundle (with source maps): 4.2MB — also reasonable.
- **Impact:** No concerns.
- **Remediation:** None needed.

### ℹ️ Info: TypeScript strict mode properly enabled

- **Location:** `tsconfig.json:6`
- **Category:** TypeScript
- **Description:** `"strict": true` is enabled. ES2022 target and NodeNext module resolution are correct for the project. `skipLibCheck: true` is appropriate for build speed.
- **Impact:** Positive — catches bugs at compile time. All 198 tests pass, typecheck clean.
- **Remediation:** Maintain strict mode. Never disable it.

## Audit Results

```
$ npm audit
found 0 vulnerabilities
```

✅ Clean audit — zero known vulnerabilities across all dependencies.

## Bundle Analysis

**Development build:**
| File | Size |
|------|------|
| `dist/extension.js` | 1.3 MB |
| `dist/extension.js.map` | 2.5 MB |
| `dist/chat.js` | 136 KB |
| `dist/chat.js.map` | 304 KB |
| **Total** | **4.2 MB** |

**Production build (`--production`):**
| File | Size |
|------|------|
| `dist/extension.js` | 528 KB |
| `dist/chat.js` | 76 KB |
| **Total** | **604 KB** |

No source maps in production. Minification reduces the main bundle by ~60%.

## Dependency Tree (direct)

```
forge@0.1.0
├── @azure/identity@4.13.0      (runtime — Entra ID auth)
├── @github/copilot-sdk@0.1.26  (runtime — core SDK)
├── dompurify@3.3.1             (runtime — webview XSS protection)
├── marked@17.0.3               (runtime — webview markdown rendering)
├── @types/node@25.3.2          (dev)
├── @types/vscode@1.109.0       (dev)
├── @typescript-eslint/*@8.56.1 (dev)
├── @vscode/vsce@3.7.1          (dev — VSIX packaging)
├── esbuild@0.27.3              (dev — bundler)
├── eslint@10.0.2               (dev — linter)
├── typescript@5.9.3            (dev — type checker)
└── vitest@4.0.18               (dev — test runner)
```

All dependencies are actively used. No orphaned packages detected. Dev/prod classification is correct.
