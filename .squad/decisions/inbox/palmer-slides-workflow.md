# Decision: Slidev GitHub Pages Deployment

**Date:** 2026-03-06
**Author:** Palmer (DevOps Specialist)
**Status:** Implemented

## Context

The team has a Slidev presentation deck in `slides/` that needs to be deployed to GitHub Pages for easy sharing.

## Decision

Created `.github/workflows/slides.yml` with a two-job pipeline (build → deploy) that:

1. **Triggers** on push to `dev` when `slides/**` changes, plus manual `workflow_dispatch`.
2. **Builds** in the `slides/` subdirectory with its own `package.json` and `npm ci` — completely isolated from the root VS Code extension.
3. **Uses `--base /forge/`** because the site deploys to `https://robpitcher.github.io/forge/` (project pages, not user pages).
4. **Uses Node 20** — this is the Slidev deck requirement, independent of the extension CI which uses Node 22.
5. **Uses the standard GitHub Pages pattern:** `actions/configure-pages` → `actions/upload-pages-artifact` → `actions/deploy-pages`.

## Constraints

- The `slides/` project is fully self-contained. The workflow does NOT build the VS Code extension.
- Concurrency group `pages` ensures only one deployment runs at a time.
- Permissions scoped to `pages: write` and `id-token: write` (minimum required for Pages deployment).

## Impact

All agents: do NOT modify this workflow unless changing the slides deployment strategy. The `slides/` directory is isolated — changes there should not affect the extension CI pipeline.
