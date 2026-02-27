# Orchestration Log: Release Branch Creation

**Timestamp:** 2026-02-27T05:21:00Z  
**Agent:** Childs (SDK Dev)  
**Task:** Create release branch and open PR to main

## Context

Rob Pitcher established a branching directive: never commit directly to `main`, only via PRs which must be human-merged. Release branches use `rel/` prefix and must strip `.squad/` before PR to main, enabling workflows like squad-heartbeat to reach main.

## Execution

1. **Branch Creation:** Created `rel/0.2.0` from `dev`
   ```bash
   git checkout dev && git pull origin dev
   git checkout -b rel/0.2.0
   ```

2. **.squad/ Stripping:** Removed 34 `.squad/` files from git tracking
   ```bash
   echo ".squad/" >> .gitignore
   git rm -r --cached .squad/
   git commit -m "chore: strip .squad/ from release branch"
   ```

3. **Push & PR:** Branch pushed to origin, PR #30 opened to main
   - Base: `main`
   - Head: `rel/0.2.0`
   - Title: "Release v0.2.0 — MVP infrastructure, workflows, and project setup"
   - Status: Open, awaiting human review/merge

4. **Return to Dev:** Switched back to `dev` branch to preserve working state

## Outcome

- Branch: `rel/0.2.0` pushed and live
- PR: #30 open (squad tooling stripped, `.github/agents/` preserved)
- Rationale: Clean main branch, squad state isolated to dev
- Next: Human review and squash-merge by Rob Pitcher

## Notes

- `.gitignore` updated to prevent accidental re-tracking of `.squad/`
- `.github/agents/` retained on release branch (needed for GitHub Copilot agent recognition)
- Squad development continues on `dev` unaffected
