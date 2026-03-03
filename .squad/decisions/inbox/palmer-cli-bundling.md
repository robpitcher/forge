# CLI Binary Bundling in .vsix Package

## Context
The Forge extension uses `@github/copilot-sdk` which depends on the `@github/copilot` CLI binary (103MB). Previously, `node_modules/**` was excluded from the .vsix, causing runtime failures when the SDK tried to resolve the CLI path.

## Decision
Include `@github/copilot` and its SDK dependencies in the .vsix package by negating the `node_modules/**` exclusion in `.vscodeignore`:

```
!node_modules/@github/copilot/**
!node_modules/@github/copilot-sdk/**
!node_modules/vscode-jsonrpc/**
!node_modules/zod/**
```

## Rationale
1. **Just works UX:** Users should NOT need to run `npm install -g @github/copilot` to use the extension
2. **SDK resolution path:** The SDK uses `import.meta.resolve("@github/copilot/sdk")` which the esbuild shim resolves by walking up from `dist/` (where `__dirname` is set) to find `node_modules/@github/copilot/sdk/index.js`
3. **Vsix structure:** In a packaged .vsix, the structure is:
   ```
   extension/
   ├── dist/
   │   ├── extension.js  ← __dirname here
   │   └── chat.js
   ├── node_modules/
   │   ├── @github/copilot/
   │   ├── @github/copilot-sdk/
   │   ├── vscode-jsonrpc/
   │   └── zod/
   └── media/
   ```
   The shim walks UP from `dist/` → `extension/` → finds `node_modules/` as a sibling, so resolution works correctly.

## Impact
- **.vsix size:** Increases from ~1.5MB to ~105MB. Acceptable — GitHub Copilot's own extension is hundreds of MB.
- **Runtime dependencies:** `vscode-jsonrpc` and `zod` are runtime deps of `@github/copilot-sdk` (not bundled by esbuild), so they must also be included.
- **Air-gap compliance:** All inference still goes to Azure AI Foundry — the CLI binary is purely for SDK internal logic, not telemetry.

## Verification
✅ `node_modules/@github/copilot/sdk/index.js` exists (12MB)  
✅ `node_modules/@github/copilot/index.js` exists (16MB)  
✅ SDK dependencies identified: `vscode-jsonrpc`, `zod`  
✅ Shim logic validated: walks UP from `dist/__dirname` to find `node_modules/` sibling  

## Alternatives Considered
1. **Extract only the CLI binary:** Too fragile — the SDK expects the full package structure (sdk/, prebuilds/, etc.)
2. **Use `which copilot` fallback:** Unreliable — might pick up wrong version, breaks air-gap UX promise
3. **Bundle CLI as extension resource:** Would require patching SDK resolution logic

## Owner
Palmer (DevOps Specialist)

## Date
2026-03-03
