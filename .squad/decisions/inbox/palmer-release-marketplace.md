# Decision: Stable release must publish the built .vsix, not re-build

**Date:** 2026-03-05
**Author:** Palmer (DevOps)
**Scope:** `.github/workflows/release.yml`

## Decision

The stable release workflow's marketplace publish step must use `--packagePath` to publish the exact `.vsix` artifact that was already built, tested, and attached to the GitHub Release. It must NOT call bare `vsce publish` which re-builds from source.

## Rationale

- **Build once, publish everywhere:** Re-building from source means the GitHub Release `.vsix` and the marketplace `.vsix` could differ (non-deterministic builds, different timestamps, potential dependency drift).
- **Consistency with insider:** The insider workflow also packages once and uploads to both GitHub Release and marketplace (though it re-packages for marketplace due to version rewriting — stable releases don't need this since package.json version IS the marketplace version).

## Convention

For stable releases: `vsce publish --packagePath {artifact}.vsix`
For insider releases: re-package is acceptable because marketplace version differs from tag version.
