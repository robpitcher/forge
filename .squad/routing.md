# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture, scope, trade-offs | MacReady | Extension structure, SDK integration patterns, session lifecycle design |
| VS Code Extension API, chat participant, streaming UI | Blair | Chat participant registration, response rendering, cancellation handling |
| Copilot SDK, BYOK config, session management | Childs | CopilotClient lifecycle, session creation, provider config, SDK events |
| Code review (quality, patterns, bugs) | Copper | Code quality, error handling, TypeScript patterns, dead code |
| Security review, auth audit, CSP | Norris | XSS prevention, secret handling, auth flow, dependency vulns, air-gap compliance |
| Architecture review | MacReady | Review PRs, check quality, suggest improvements |
| Testing, error paths, validation | Windows | Write tests, find edge cases, verify air-gap behavior, error handling |
| Scope & priorities | MacReady | What to build next, trade-offs, decisions |
| Packaging & distribution (.vsix) | Palmer | esbuild bundling, vsce package, sideloading, release automation |
| CI/CD, GitHub Actions, infrastructure | Palmer | Workflows, build pipelines, devcontainer, environment setup |
| Configuration & settings | Blair | VS Code settings contribution, validation |
| Documentation, README, guides | Fuchs | User docs, setup guides, API reference, changelogs, inline docs |
| Mermaid diagrams, visual docs, architecture visuals | Nauls | Flowcharts, sequence diagrams, state diagrams, ER diagrams |
| Async issue work (bugs, tests, small features) | @copilot 🤖 | Well-defined tasks matching capability profile |
| Session logging | Scribe | Automatic — never needs routing |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, evaluate @copilot fit, assign `squad:{member}` label | MacReady |
| `squad:macready` | Architecture or review task | MacReady |
| `squad:blair` | VS Code extension work | Blair |
| `squad:childs` | SDK integration work | Childs |
| `squad:windows` | Testing task | Windows |
| `squad:palmer` | DevOps / CI/CD / packaging task | Palmer |
| `squad:fuchs` | Documentation task | Fuchs |
| `squad:norris` | Security review task | Norris |
| `squad:copper` | Code quality review task | Copper |
| `squad:nauls` | Diagram / visual documentation task | Nauls |
| `squad:copilot` | Assign to @copilot for autonomous work (if enabled) | @copilot 🤖 |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **MacReady** triages it — analyzing content, evaluating @copilot's capability profile, assigning the right `squad:{member}` label, and commenting with triage notes.
2. **@copilot evaluation:** MacReady checks if the issue matches @copilot's capability profile (🟢 good fit / 🟡 needs review / 🔴 not suitable). If it's a good fit, MacReady may route to `squad:copilot` instead of a squad member.
3. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
4. When `squad:copilot` is applied and auto-assign is enabled, `@copilot` is assigned on the issue and picks it up autonomously.
5. Members can reassign by removing their label and adding another member's label.
6. The `squad` label is the "inbox" — untriaged issues waiting for MacReady's review.

### Lead Triage Guidance for @copilot

When triaging, MacReady should ask:

1. **Is this well-defined?** Clear title, reproduction steps or acceptance criteria, bounded scope → likely 🟢
2. **Does it follow existing patterns?** Adding a test, fixing a known bug, updating a dependency → likely 🟢
3. **Does it need design judgment?** Architecture, API design, UX decisions → likely 🔴
4. **Is it security-sensitive?** Auth, encryption, access control → always 🔴
5. **Is it medium complexity with specs?** Feature with clear requirements, refactoring with tests → likely 🟡

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. MacReady handles all `squad` (base label) triage.
8. **@copilot routing** — when evaluating issues, check @copilot's capability profile in `team.md`. Route 🟢 good-fit tasks to `squad:copilot`. Flag 🟡 needs-review tasks for PR review. Keep 🔴 not-suitable tasks with squad members.
