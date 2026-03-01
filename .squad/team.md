# Team Roster

> VS Code extension providing Copilot Chat for air-gapped environments via Azure AI Foundry (BYOK mode)

## Coordinator

| Name | Role | Notes |
|------|------|-------|
| Squad | Coordinator | Routes work, enforces handoffs and reviewer gates. Does not generate domain artifacts. |

## Members

| Name | Role | Charter | Status |
|------|------|---------|--------|
| MacReady | Lead | `.squad/agents/macready/charter.md` | ✅ Active |
| Blair | Extension Dev | `.squad/agents/blair/charter.md` | ✅ Active |
| Childs | SDK Dev | `.squad/agents/childs/charter.md` | ✅ Active |
| Windows | Tester | `.squad/agents/windows/charter.md` | ✅ Active |
| Palmer | DevOps | `.squad/agents/palmer/charter.md` | ✅ Active |
| Fuchs | Technical Writer | `.squad/agents/fuchs/charter.md` | ✅ Active |
| Scribe | Session Logger | `.squad/agents/scribe/charter.md` | 📋 Silent |
| Ralph | Work Monitor | — | 🔄 Monitor |

## Coding Agent

<!-- copilot-auto-assign: true -->

| Name | Role | Charter | Status |
|------|------|---------|--------|
| @copilot | Coding Agent | — | 🤖 Coding Agent |

### Capabilities

**🟢 Good fit — auto-route when enabled:**
- Bug fixes with clear reproduction steps
- Test coverage (adding missing tests, fixing flaky tests)
- Lint/format fixes and code style cleanup
- Dependency updates and version bumps
- Small isolated features with clear specs
- Boilerplate/scaffolding generation
- Documentation fixes and README updates

**🟡 Needs review — route to @copilot but flag for squad member PR review:**
- Medium features with clear specs and acceptance criteria
- Refactoring with existing test coverage
- API endpoint additions following established patterns

**🔴 Not suitable — route to squad member instead:**
- Architecture decisions and system design
- Multi-system integration requiring coordination
- Ambiguous requirements needing clarification
- Security-critical changes (auth, encryption, access control)
- Performance-critical paths requiring benchmarking
- Changes requiring cross-team discussion

## Project Context

- **Owner:** Rob Pitcher
- **Stack:** TypeScript, VS Code Extension API, @github/copilot-sdk, esbuild, Azure AI Foundry
- **Description:** VS Code chat extension for air-gapped environments — routes AI inference to private Azure AI Foundry via Copilot SDK BYOK mode
- **Created:** 2026-02-27T03:29:00Z
