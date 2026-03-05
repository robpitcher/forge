# Decision: Marketplace-First Installation Path in README

**Date:** 2026-03-15  
**Author:** Fuchs (Technical Writer)  
**Scope:** Documentation · User-facing content  
**Status:** Merged

## Problem

The README's Quick Start and Installation sections positioned GitHub Releases sideloading as the primary/recommended path. This framing was:
- Not aligned with standard VS Code extension distribution (Marketplace is the user expectation)
- Potentially discouraging for mainstream VS Code users unfamiliar with `.vsix` workflows
- Overweighting air-gapped scenarios as "the default" rather than "an important alternative"

## Decision

Restructure README sections to position **VS Code Marketplace as the primary installation method**, while preserving the **GitHub Releases sideload path as a valid secondary option for air-gapped/restricted-network scenarios**.

### Changes Made

1. **Quick Start (line 41):**
   - Primary instruction: Search for "Forge" in VS Code Extensions panel or use Marketplace link
   - Fallback note: "If your environment doesn't have Marketplace access, see Installation for the sideload option"

2. **Installation (lines 96–110):**
   - Reordered: Marketplace subsection first, GitHub Releases second
   - Marketplace header: "(recommended)" — signals it's the primary path
   - Marketplace content: Simple steps (open Extensions, search, click Install) + note about Pre-Release tab
   - Releases header: "(for restricted or air-gapped networks)" — signals it's an alternative with a use case
   - Releases content: Unchanged sideload workflow

### Rationale

- **User expectations:** 99% of VS Code users expect to install extensions from the Marketplace. Making it first honors that familiar flow.
- **Air-gapped support:** Sideload remains fully documented and prominent — nothing is hidden. Just reframed as "when you need it" rather than "the way to go".
- **Tone:** Marketplace = easy/default; sideload = valid/alternative. Reflects Forge's dual nature (mainstream + compliance-driven).
- **Accuracy:** Marketplace publishes pre-release builds, so it's current and actively maintained — not "someday" or "maybe", making it credible as the primary path.

## Impact

- ✅ Improves onboarding for mainstream VS Code users (most common case)
- ✅ Maintains full support for air-gapped/restricted deployments (documented path)
- ✅ Aligns README narrative with actual distribution strategy
- ✅ No breaking changes — all existing workflows still work
- ✅ Commit: `squad/readme-restructure-diagrams` (0914c65)
