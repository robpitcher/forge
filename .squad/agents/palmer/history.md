# Palmer — History

## Project Context

**Forge** is a VS Code extension providing AI chat for air-gapped environments via Azure AI Foundry. Uses `@github/copilot-sdk` in BYOK mode.

- **Owner:** Rob Pitcher
- **Stack:** TypeScript · VS Code Extension API · @github/copilot-sdk (v0.1.26) · esbuild · vitest
- **Build:** `npm run build` (esbuild) · `npm test` (vitest) · `npx tsc --noEmit` (typecheck)
- **Branching:** `dev` is the default branch, `main` is release-only

## Learnings

### Build & Dependency Review — Deep Pass (Issue #112)
- **CI/CD is fully broken across 4 workflows:** `node --test test/*.test.js` targets a non-existent `test/` dir. No `npm ci`, no build, no lint, no typecheck in any pipeline. Effectively zero CI validation.
- **Release workflows don't produce .vsix:** Tags and GitHub Releases are created, but no `npm run package` or artifact upload. `@vscode/vsce` is a dev dep but unused in CI.
- **Bundle strategy is sound:** esbuild dual-bundle (extension.js 528KB + chat.js 76KB prod). Source maps and minify correctly toggled by `--production` flag. No bloat detected.
- **Dependency hygiene excellent:** Zero vulnerabilities, all 4 runtime deps actively used, dev/prod classification correct. No orphaned packages.
- **Package script has a stale-map risk:** Dev `.map` files persist in `dist/` and could leak into `.vsix`. Needs `rm -rf dist` before production build.
- **Endpoint config example is misleading:** `package.json` shows `/openai/v1/` in the endpoint URL, but the SDK auto-appends that path for `type: "azure"`. Users will get 404s.
- **Missing marketplace metadata:** No `icon` (PNG), `keywords`, `extensionKind`, or `preview` field in `package.json`.
- **tsconfig `declaration: true` is unnecessary** — esbuild bundles, tsc only typechecks with `--noEmit`.
- **TypeScript strict mode enabled** — all good. 198 tests passing, typecheck clean.
- **Next actions:** Fix all 4 CI workflows (npm ci + build + lint + typecheck + npm test), add .vsix packaging to releases, fix endpoint example, add clean step to package script.

### CI Workflow — ready_for_review trigger (Issue #104)
- **Added `ready_for_review` to `pull_request.types`** in `.github/workflows/ci.yml` so CI runs when draft PRs are marked ready for review.
- **Key file:** `.github/workflows/ci.yml` — the replacement CI pipeline (replaces broken `squad-ci.yml` which used `node --test`).
- **Pipeline order:** npm ci → lint → typecheck → build → test. This is the correct full validation sequence.
- **Branch triggers kept broad:** `pull_request` on `[dev, main]`, `push` on `[dev]`. Do not narrow — this workflow is the primary CI for all PRs.

📌 Team update (2026-03-02T13:36:00Z): Release pipeline fixes completed — annotated tags now used in release.yml, legacy squad-release.yml removed. PR #117 merged to dev. Commit 8d9f8fb verified.

### CLI Binary Bundling — Copilot SDK Runtime Resolution (2026-03-03)
- **Problem:** `.vscodeignore` excluded `node_modules/**`, causing the SDK's `import.meta.resolve("@github/copilot/sdk")` to fail when installed from .vsix. Users had to run `npm install -g @github/copilot` as a workaround.
- **Solution:** Negated the `node_modules/**` exclusion for required packages:
  - `!node_modules/@github/copilot/**` (103MB CLI binary + native modules)
  - `!node_modules/@github/copilot-sdk/**` (SDK itself — needed for import.meta.resolve)
  - `!node_modules/vscode-jsonrpc/**` (SDK runtime dep, not bundled by esbuild)
  - `!node_modules/zod/**` (SDK runtime dep, not bundled by esbuild)
- **Shim verification:** The esbuild `import.meta.resolve` shim starts at `__dirname` (which is `dist/` in the vsix) and walks UP to find `node_modules/` as a sibling. This structure is preserved in packaged .vsix files, so resolution works correctly.
- **.vsix impact:** Size increases from ~1.5MB to ~105MB. Acceptable — GitHub Copilot's extension is hundreds of MB, and Rob explicitly prioritized "just works" UX over package size.
- **Decision doc:** `.squad/decisions/inbox/palmer-cli-bundling.md`
- **Note:** Build is pre-broken on this branch (highlight.js/marked-highlight resolution errors in media/chat.js) — unrelated to this change.

### Windows-Safe Squad Logging Filenames (2026-03-03)
- **Problem:** ISO 8601 UTC timestamps in squad log filenames (e.g., `2026-02-27T05:03:36Z`) contain colons, which are invalid in Windows filenames. Windows clones failed with "invalid path" errors.
- **Solution:** Renamed all 51 tracked log files in `.squad/log/` and `.squad/orchestration-log/` to use hyphens instead of colons (e.g., `2026-02-27T05-03-36Z`).
- **Prevention:** Updated guidance and templates to specify Windows-safe timestamp format:
  - `.squad-templates/orchestration-log.md` — clarified `2026-02-27T14-39-00Z` format
  - `.squad-templates/scribe-charter.md` — added Windows-safe guidance to session logging section
  - `.github/agents/squad.agent.md` — updated Scribe spawn instructions to use Windows-safe timestamps
- **Verification:** `git ls-files | grep ":"` returns zero — all tracked files are now Windows-safe.
- **Commit:** `9e12441` — 53 files changed (51 renames + 3 template updates).
- **Impact:** Windows developers can now clone and work on the repository without path errors.

### Marketplace Pre-Release Publishing (2026-03-03)
- **Goal:** Extend insider-release.yml to publish pre-release builds to VS Code Marketplace using Rob's PAT (`ADO_MARKETPLACE_PAT`).
- **package.json changes:**
  - Added `"vscode:prepublish": "npm run build -- --production"` — convention for VS Code extensions; runs automatically before `vsce package/publish`.
  - Updated `package` script to just `"vsce package"` — build now delegated to `vscode:prepublish` lifecycle hook.
- **insider-release.yml changes:**
  - New marketplace publish step runs AFTER GitHub Release verification (GitHub Release is primary artifact).
  - **Version strategy:** Compute `{major}.{minor}.{github.run_number}` (e.g., `0.2.15`) to ensure each insider build has a unique marketplace version.
  - Use `npm version --no-git-tag-version` to update package.json in CI without committing.
  - Package and publish with `--pre-release` flag to show "Pre-Release" badge on marketplace.
  - **Error handling:** `continue-on-error: true` on marketplace publish — if marketplace fails, GitHub Release still succeeds.
- **Key files:** `package.json` (scripts), `.github/workflows/insider-release.yml` (marketplace publish steps).
- **Decision doc:** `.squad/decisions/inbox/palmer-marketplace-prerelease.md` — documents the dual-version strategy (insider tags vs marketplace versions).

### Dead Code & VSIX Cleanup — Code Review Pass (2026-03-04)
- **Problem:** Stale workflow references, unnecessary config files in extension package, and non-deterministic sourcemap handling.
- **Findings:**
  - squad-promote.yml line 117 mentioned non-existent "squad-release.yml" — CI/CD team would follow broken messaging on release flow
  - .vscodeignore was correctly excluding dist/*.map but eslint.config.mjs and vitest.config.mts were shipping in .vsix (dev-only tools bloating package)
  - package.json npm script had no cleanup for stale sourcemaps; if dev built, then npm run vscode:prepublish ran, old .map files persisted in dist/ and could cause confusion
- **Changes Made:**
  - **squad-promote.yml:** Updated echo message to reference correct workflow (release.yml, not squad-release.yml)
  - **.vscodeignore:** Added eslint.config.mjs and vitest.config.mts to exclusion list — these config files are dev-only, never needed in extension package
  - **package.json:** Updated "package" script from `vsce package` to `rm -rf dist/*.map && vsce package` — now cleans stale sourcemaps before every packaging run for deterministic builds
- **Risk Mitigation:** All changes are safe:
  - Workflow messaging fix has zero functional impact, just clarity
  - Config file exclusion matches existing pattern and vsce [respects .vscodeignore](https://github.com/microsoft/vscode-vsce/blob/master/README.md#publish)
  - Sourcemap cleanup runs AFTER production build (which doesn't create .map files), so it's a no-op for clean builds but catches dev artifacts
- **Validation:** npm run build && npm run lint && tsc --noEmit && npm test — all 291 tests passing, no regressions
- **Commit:** 0bb3593 on feat/notif-cleanup-and-review

### Stable Release Marketplace Publish Fix (2026-03-05)
- **Problem:** Copilot added a minimal `vsce publish` step to release.yml that re-built from source instead of publishing the already-tested `.vsix`. This meant the GitHub Release artifact and marketplace artifact could differ (two separate builds from same source).
- **Root cause:** `vsce publish` without `--packagePath` triggers `vscode:prepublish` and re-packages from scratch. Also, the version step ran AFTER the package step, so `--out` couldn't reference the version.
- **Additional finding:** `npm run package` (which runs bare `vsce package`) would produce `forge-ai-{version}.vsix` (using the package name), but the GitHub Release step referenced `forge-{version}.vsix`. The `--out` flag fixes this by producing the exact expected filename.
- **Changes:**
  1. Moved "Read version" step before "Package extension" so version is available as an output
  2. Added `--out forge-$VERSION.vsix` to package step for deterministic filename matching insider convention
  3. Changed publish step to `vsce publish --packagePath forge-$VERSION.vsix` — publishes the exact `.vsix` that was tested and attached to GitHub Release
- **Key principle:** Build once, publish everywhere. The same `.vsix` flows through: build → test → GitHub Release → Marketplace.
- **Commit:** 6fe3e19 on copilot/update-release-workflow-for-vscode-marketplace

### Slidev GitHub Pages Deployment Workflow (2026-03-06)
- **Goal:** Deploy the Slidev presentation deck from `slides/` to GitHub Pages automatically.
- **Workflow:** `.github/workflows/slides.yml` — triggers on push to `dev` when `slides/**` changes, plus `workflow_dispatch`.
- **Pattern:** Two-job pipeline: `build` (checkout → setup-node → npm ci → slidev build --base /forge/) → `deploy` (actions/deploy-pages).
- **Base path:** `--base /forge/` is required because the site deploys to `https://robpitcher.github.io/forge/`, not the root.
- **Node version:** 20 (per task requirements — separate from the extension CI which uses Node 22).
- **Cache:** Uses `cache-dependency-path: slides/package-lock.json` since the slides project has its own `package.json` independent of the root.
- **Permissions:** `pages: write` + `id-token: write` for GitHub Pages deployment token.
- **Concurrency:** `group: pages` with `cancel-in-progress: true` to avoid overlapping deployments.
- **Key files:** `.github/workflows/slides.yml`, `slides/` (Slidev project, independent of VS Code extension).
