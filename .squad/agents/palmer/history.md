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
