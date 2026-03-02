### Documentation Audit — Consistency & Accuracy Pass
**By:** MacReady
**When:** Post-PR #116 multi-round review
**What:**

Audited all documentation files (`README.md`, `docs/configuration-reference.md`, `docs/sideload-test-checklist.md`, `package.json`) for consistency with the actual codebase.

**Key decisions enforced:**

1. **Setting name is `forge.copilot.models` (array), not `forge.copilot.model` (string).** All documentation must use the plural form with array syntax. Default is `[]`.

2. **Endpoint URL must NOT include `/openai/v1/`.** The SDK auto-appends this path for `.azure.com` endpoints. Documentation that tells users to include it causes double-pathing errors.

3. **"Air-gapped" is a scenario, not primary positioning.** Per the earlier positioning decision, "air-gapped" should only appear as one of several environment types (alongside compliance-driven, restricted networks, etc.), never as the headline framing. Package.json setting descriptions updated to use "restricted environments" / "network safety" instead.

4. **Entra ID is the default auth method.** Documentation should not present API key setup as a required step — it's one of two auth options, and Entra ID is the default.

5. **Forge lives in the sidebar (activity bar), not the bottom panel.** UI location references must say "sidebar" or "activity bar", not "bottom panel" or "panel area".

**Why:** After many rounds of PR #116 changes, the docs had drifted significantly from the codebase. The `model` → `models` rename and endpoint URL format issues were actively harmful — they'd cause users to misconfigure the extension.
