# Contributing to Forge

Welcome! Forge is an open-source VS Code extension for enterprise AI chat in air-gapped environments. We appreciate contributions — whether bug reports, feature requests, documentation improvements, or code. This guide explains how to set up your environment and submit changes.

**MIT License** — All contributions to this project are under the same MIT license as the project itself. See [LICENSE](LICENSE) for details.

---

## Getting Started

### Prerequisites

- **Node.js** 22 or later
- **npm** (comes with Node.js)
- **Git**

### Fork and Clone

1. [Fork the Forge repository](https://github.com/robpitcher/forge/fork)
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/forge.git
   cd forge
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/robpitcher/forge.git
   ```

### Development Environment Setup

**Recommended: Dev Containers (Codespaces or local)**

The project includes a `.devcontainer/devcontainer.json` with a fully configured environment (Node.js 22, Git, GitHub CLI, Azure CLI).

- **GitHub Codespaces:** Open in browser via [Codespaces](https://github.com/codespaces/new?repo=robpitcher/forge)
- **VS Code Dev Containers:** Open the cloned folder in VS Code, click "Reopen in Container" (requires [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers))

**Manual Setup**

If not using a dev container:

```bash
npm ci
```

Installs dependencies locked to `package-lock.json`.

---

## Development Workflow

### Build Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Bundle extension and SDK into `dist/extension.js` |
| `npm run watch` | Rebuild on file changes |
| `npm run lint` | Run ESLint |
| `npm run lint:types` | TypeScript type-checking (`tsc --noEmit`) |
| `npm run test` | Run Vitest test suite |
| `npm run package` | Create `.vsix` package for distribution |

### Full Quality Check

Before committing, run the complete check:

```bash
npm run build && npx tsc --noEmit && npm test
```

This ensures your changes compile, pass type checking, and pass all tests.

### Testing in VS Code

Press **F5** in VS Code to launch the Extension Development Host. This opens a new VS Code window running your local version of Forge, allowing you to test changes interactively.

### Architecture Overview

Forge is a TypeScript VS Code extension using the GitHub Copilot SDK (`@github/copilot-sdk`) in BYOK mode.

**Key source files:**
- `src/extension.ts` — Extension activation, WebviewView setup, message routing
- `src/copilotService.ts` — CopilotClient lifecycle and session management
- `src/configuration.ts` — VS Code settings validation
- `src/auth/credentialProvider.ts` — Entra ID and API key authentication
- `src/types.ts` — SDK type definitions
- `media/chat.js` — Webview UI logic
- `media/chat.css` — Webview styles

For a full architecture overview, see [README.md](README.md).

---

## Branch Strategy

**`dev` is the default development branch. `main` is the release branch.**

- **All development PRs target `dev`** — This is where active feature work happens.
- **`main` receives only release PRs** — Stable releases are merged to `main` from `dev`.

### Creating a Branch

Always branch from `dev`:

```bash
git fetch upstream dev
git checkout -b squad/123-your-feature upstream/dev
```

**Branch naming:**
- `squad/{issue-number}-{slug}` — For issues tracked in squad; e.g., `squad/42-fix-login-validation`
- Descriptive feature names — e.g., `improve-error-messages`, `add-model-selector`

---

## Making Changes

### Workflow

1. **Create a feature branch** from `dev` (see [Branch Strategy](#branch-strategy) above)
2. **Make your changes** — Edit files, add features, fix bugs
3. **Run the full check:**
   ```bash
   npm run build && npx tsc --noEmit && npm test
   ```
   Ensure build, types, and tests all pass.
4. **Commit with clear messages:**
   ```bash
   git commit -m "Brief description of change"
   ```
   Conventional commits style (e.g., `fix:`, `feat:`, `docs:`) is encouraged but not required.
5. **Push to your fork:**
   ```bash
   git push origin squad/123-your-feature
   ```
6. **Open a pull request** targeting `dev` (see [Pull Request Guidelines](#pull-request-guidelines))

---

## Pull Request Guidelines

### Before Submitting

- ✅ Ensure **all tests pass** (`npm run build && npx tsc --noEmit && npm test`)
- ✅ Run **ESLint** (`npm run lint`) to check code style
- ✅ **Base your PR on `dev`** — never on `main`
- ✅ Keep commits logical and clean

### PR Description

In the PR title and description:

- **Reference related issues:** Use "Closes #123" or "Fixes #456"
- **Describe what changed:** Be specific about the change and why
- **Include screenshots for UI changes:** Helps reviewers understand visual changes at a glance
- **Note any breaking changes:** Mark as such if the change affects users or the API

### Review Process

- All PRs require review before merging
- CI (build, lint, tests) must pass
- Reviewers may request changes — address feedback promptly

---

## Code Style

### TypeScript Conventions

- **Strict mode** is enabled — all code must pass `tsc --noEmit`
- Use `import type` for type-only imports:
  ```typescript
  import type { MyType } from './types';
  import { MyFunction } from './utils';
  ```
- Prefer `.js` extensions in import paths for ESM compatibility:
  ```typescript
  import { helper } from './utils.js';
  ```
- Use `interface` for structural types; `type` for unions and aliases
- No `any` types without explicit `// @ts-ignore` comment (and good reason)

### Formatting & Linting

- Run **ESLint** before committing:
  ```bash
  npm run lint
  ```
- ESLint is configured with `@typescript-eslint` and handles code style automatically
- The build step (`npm run build`) does not auto-format — lint manually

### Testing

- **Framework:** Vitest
- **Mocks:** Live in `src/test/__mocks__/` (e.g., `vscode.ts`, `copilot-sdk.ts`)
- **Test helpers:** `src/test/webview-test-helpers.ts` for webview-related tests
- Run tests before submitting:
  ```bash
  npm test
  ```

---

## Reporting Issues

### Bug Reports

Use [GitHub Issues](https://github.com/robpitcher/forge/issues/new) and include:

- **What happened?** — Describe the unexpected behavior
- **What did you expect?** — What should have happened
- **Steps to reproduce** — Minimal steps to trigger the bug
- **Environment:** VS Code version, Forge version, auth method (Entra ID/API Key), OS
- **Error messages or logs** — Copy relevant error output or VS Code logs

### Feature Requests

[Open a GitHub Issue](https://github.com/robpitcher/forge/issues/new) with:

- **Title:** Brief summary of the feature
- **Motivation:** Why is this useful?
- **Example usage:** How would users interact with it?

### Security Vulnerabilities

For security issues, **do not open a public issue**. Email the maintainer directly at [contact info in README](README.md).

---

## Documentation

Documentation improvements are welcome. Edit files in:

- `README.md` — User-facing overview, quick start, architecture
- `docs/` — Detailed guides, configuration reference, deployment scenarios
- Inline code comments — Explain _why_, not _what_; assume readers understand TypeScript
- `CHANGELOG.md` — Release notes following [Keep a Changelog](https://keepachangelog.com/) format

Run the full check after editing docs (even though docs don't need linting, ensure no accidental code breaks):

```bash
npm run build && npx tsc --noEmit && npm test
```

---

## License

By contributing to Forge, you agree that your contributions are licensed under the [MIT License](LICENSE). All contributors retain copyright to their work; the MIT license only grants usage rights.

---

## Questions?

- Check the [README](README.md) for project overview
- See [docs/](docs/) for detailed guides
- Open an issue to start a discussion
- Review [Architecture](README.md#architecture) for system design
