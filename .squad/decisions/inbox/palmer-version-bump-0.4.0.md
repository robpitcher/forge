# Version Bump to 0.4.0

**Date:** 2026-03-07  
**Decision Maker:** Palmer (DevOps Specialist)  
**Branch:** `squad/clean-v0.4.0-version-bump`  
**Status:** Complete

## Summary

Bumped Forge from `0.3.2` to `0.4.0` for clean marketplace versioning alignment. This is a clean version reset with no feature changes.

## What Changed

1. **package.json** — Version field updated from `0.3.2` to `0.4.0`
2. **package-lock.json** — Regenerated via `npm install` to reflect new version
3. **CHANGELOG.md** — Added new `[0.4.0]` section with date 2026-03-07 and entry: "Version Reset — Bumped to 0.4.0 for clean versioning. Insider builds no longer publish to VS Code Marketplace — distributed via GitHub Releases only"
4. **.github/workflows/insider-release.yml** — Removed marketplace publish steps (done in prior commit by Palmer); insider releases now distribute via GitHub Releases only

## Rationale

- **Clean versioning:** Starting fresh at 0.4.0 for marketplace compatibility
- **Release strategy clarity:** Insider builds (0.4.0-insider) go to GitHub Releases; stable releases (0.4.x) go to VS Code Marketplace
- **Automation:** Removed marketplace publish from insider workflow to avoid version collision and clarify stable-only release path

## Build Verification

- `npm run build` ✅ (bundle created)
- `npx tsc --noEmit` ✅ (type check passed)
- `npm test` — 5 test files with pre-existing failures (unrelated to this change; same failures observed on parent branch)

## Commit

```
chore: bump version to 0.4.0, remove marketplace from insider release

- Version reset to 0.4.0 for clean marketplace alignment
- Removed marketplace publish step from insider-release.yml
- Insider builds now distribute via GitHub Releases only
- Stable releases remain the sole path to VS Code Marketplace

Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

All changes staged and committed.
