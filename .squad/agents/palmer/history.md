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
