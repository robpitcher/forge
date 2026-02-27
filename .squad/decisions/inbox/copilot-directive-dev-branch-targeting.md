### 2026-02-27T12:29:54Z: User directive — Copilot must target dev branch
**By:** Rob Pitcher (via Copilot)
**What:** The Copilot coding agent must always base branches off `dev` and open PRs targeting `dev`. PRs must never target `main` — `main` is the release branch only. PRs #31, #32, #33 were closed because they incorrectly targeted `main`.
**Why:** User request — branching strategy requires all development work flows through `dev`. Captured for team memory.
