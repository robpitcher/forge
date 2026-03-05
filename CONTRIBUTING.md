# Contributing to Forge

## Development Environment

The included `.devcontainer/devcontainer.json` provides a pre-configured development setup with Node.js, Git, GitHub CLI, and Azure CLI. Open in [GitHub Codespaces](https://github.com/codespaces/new?repo=robpitcher/forge) or [VS Code Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) for a seamless setup.

### Install dependencies

```bash
npm ci
```

### Build

```bash
npm run build
```

Bundles the extension and SDK into `dist/extension.js`.

### Watch mode

```bash
npm run watch
```

Rebuilds on file changes.

### Linting

```bash
npm run lint        # ESLint
npm run lint:types  # TypeScript type-checking (tsc --noEmit)
```

Lints source code with ESLint. Use `lint:types` for TypeScript type-checking.

### Testing

```bash
npm run test
```

Runs automated tests with Vitest.

### Package for distribution

```bash
npm run package
```

Creates a `.vsix` package (named `forge-<version>.vsix`) for sideloading or distribution.
