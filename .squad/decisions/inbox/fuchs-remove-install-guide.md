# Decision: Remove Copilot CLI Installation Guide from Docs

**Date:** 2025-01-10  
**Author:** Fuchs (Technical Writer)  
**Status:** Implemented

## Decision

Removed `docs/installation-guide.md` and redirected all documentation references to the upstream [Copilot CLI repository](https://github.com/github/copilot-cli).

## Rationale

- Copilot CLI installation instructions are **out of scope** for Forge documentation — they are maintained upstream by the Copilot CLI team.
- Duplicating upstream docs creates maintenance burden and risks version drift.
- Air-gapped deployment philosophy: **minimize duplicated docs, always link to canonical sources.**

## Changes

1. Deleted `docs/installation-guide.md`
2. Updated `README.md` line 18: Quick Start step 2 now links to [Copilot CLI repo](https://github.com/github/copilot-cli)
3. Updated `docs/configuration-reference.md`:
   - Line 187: "cliPath" setting reference updated to link to Copilot CLI repo
   - Line 556: Summary section updated to link to Copilot CLI repo for CLI installation
4. Added **Azure CLI (`az`)** as a prerequisite in `README.md` Prerequisites section (required for Entra ID auth)

## Impact

- Users now have a **single canonical source** for Copilot CLI setup (upstream repo)
- README explicitly lists Azure CLI as a prerequisite, improving setup clarity
- Reduced doc maintenance surface area
