# Decision: CJS polyfill for import.meta.resolve in esbuild bundle

**Author:** Childs (SDK Dev)
**Date:** 2026-02-27
**Status:** Implemented
**Relates to:** #53

## Context

`@github/copilot-sdk` v0.1.26 calls `import.meta.resolve("@github/copilot/sdk")` in its `getBundledCliPath()` function to locate the bundled Copilot CLI binary. Our esbuild config bundles everything into CJS format (`format: "cjs"`), which converts `import.meta` into an empty object — dropping the `resolve()` method and causing a runtime error.

## Options Evaluated

1. **Mark SDK as external** — SDK stays in `node_modules/` as native ESM. Rejected: the SDK and `@github/copilot` packages only expose `import` condition in their exports maps, so `require()` from CJS cannot load them on Node < 22. Also requires whitelisting multiple transitive deps in `.vscodeignore`.

2. **Banner polyfill (raw)** — Inject `import.meta.resolve` shim in banner. Rejected: `import.meta` syntax doesn't parse in CJS context; the banner alone can't patch esbuild's internal `import_meta` variable.

3. **Switch to ESM output** — Change `format: "esm"` in esbuild. Rejected: VS Code extension host traditionally expects CJS modules.

4. **esbuild `define` + `banner`** ✅ — Use `define: { "import.meta.resolve": "__importMetaResolve" }` to replace the property access at compile time, and `banner` to inject a CJS-compatible polyfill that walks `node_modules` directories to resolve specifiers. Bypasses exports-map restrictions. Returns `file://` URLs matching native behavior.

## Decision

Option 4. The `define` option tells esbuild to replace every `import.meta.resolve` reference with `__importMetaResolve`. The banner injects an IIFE that implements module resolution by walking the directory tree from `__dirname` upward, looking for the package in `node_modules/`. This avoids `require.resolve()` entirely (which fails on ESM-only exports maps) and returns a `file://` URL consistent with the native API.

## Risks

- If the SDK adds more `import.meta` usages beyond `.resolve`, they'd need separate handling.
- The polyfill assumes standard `node_modules` layout (not PnP or other resolution schemes).
- The `@github/copilot` package (CLI binary) must still exist in `node_modules/` at runtime for `getBundledCliPath()` to succeed. Currently `.vscodeignore` excludes all of `node_modules/**` — this is an existing gap unrelated to this fix (users must set `enclave.copilot.cliPath` or the packaging must be updated separately).
