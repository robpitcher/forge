# Decision: CONTRIBUTING.md Rewrite

**Date:** 2026-03-16  
**Author:** Fuchs (Technical Writer)  
**Status:** Implemented  

## Context

The existing `CONTRIBUTING.md` contained only a bare list of npm commands. Contributors had no guidance on:
- Forking, cloning, or setting up the dev environment
- Branch strategy (when to use `dev` vs `main`)
- PR submission workflow
- Code style expectations
- How to run a complete quality check before committing

## Decision

Rewrote `CONTRIBUTING.md` as a comprehensive 10-section guide:

1. **Welcome** — Brief intro, MIT license note
2. **Getting Started** — Fork/clone + dev container (recommended) + manual setup
3. **Development Workflow** — Build commands table + full quality check command + F5 testing in VS Code
4. **Branch Strategy** — `dev` as default, `main` as release-only; squad branch naming
5. **Making Changes** — Step-by-step workflow from branch creation to PR
6. **Pull Request Guidelines** — Checklist, description template, review expectations
7. **Code Style** — TypeScript conventions (strict mode, import type, .js paths), linting, testing
8. **Reporting Issues** — Bug reports, features, security process
9. **Documentation** — Where docs live, what to edit
10. **License** — MIT contributions clarification

## Key Structural Choices

### Dev Containers as Recommended Path
Positioned `.devcontainer/devcontainer.json` as the **recommended** onboarding path (Codespaces or VS Code Dev Containers), with manual Node 22 + npm setup as a fallback. This reduces friction for new contributors while respecting developers who prefer local setup.

### Full Quality Check Command
Made the **pre-commit check explicit:**
```bash
npm run build && npx tsc --noEmit && npm test
```
This combines build, type checking, and tests into one memorable command. It now appears in three places: Development Workflow table, Making Changes workflow, and as a bolded reminder in Pull Request Guidelines.

### Unchanged npm Commands
All existing npm commands remain **exactly as they are** in the original CONTRIBUTING.md. No renaming, no new commands. Simplifies transition for existing contributors.

### Squad Branch Naming Included
Documented squad branch convention `squad/{issue}-{slug}` alongside descriptive feature names. This acknowledges the squad workflow without excluding contributors not using squad labels.

### Architecture Pointer, Not Duplication
The Architecture Overview section **orients contributors to key files** without duplicating the full system design (which lives in README.md and docs/). This reduces maintenance burden — if architecture changes, contributors read the source of truth, not outdated CONTRIBUTING.md.

### Concise, Scannable Tone
- Used tables for build commands, checklists for PR submissions
- Short paragraphs, bullet points, code blocks
- Developer-focused language (no marketing; no overly long motivational text)
- Assumes readers understand Git and TypeScript basics

## Rationale

A comprehensive contributing guide **accelerates onboarding** and **reduces support burden**. New contributors can answer their own questions:
- "How do I set up?" → Getting Started
- "What branch do I use?" → Branch Strategy
- "How do I test my change?" → Full Quality Check
- "What code style?" → Code Style

This guide also **documents implicit team decisions** (e.g., "dev is the default branch, main is for releases") that were previously communicated only in PRs or ad-hoc.

## Impact

- **First-time contributors** have a clear path: fork → branch from dev → full check → PR targeting dev
- **Code quality** improved: explicit "full check" command reduces accidental breakage
- **Review efficiency:** contributors come prepared with passing tests and lints
- **Consistency:** squad members and external contributors now follow the same workflow
