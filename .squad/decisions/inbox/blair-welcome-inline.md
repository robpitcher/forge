# Decision: configStatus message ordering in resolveWebviewView

**Branch:** squad/120-welcome-inline  
**Date:** 2026-03-02  
**Author:** Blair (Extension Dev)

## Context

Issue #120 adds a first-run welcome card. The welcome card needs to know whether endpoint, auth, and models are configured. This requires a new `configStatus` message from the extension to the webview.

## Decision

`configStatus` is sent as the **fourth** lifecycle message in `resolveWebviewView`, after `authStatus`, `modelsUpdated`, and `modelSelected`. The message carries `hasEndpoint`, `hasAuth`, and `hasModels` booleans.

```typescript
this._view?.webview.postMessage({
  type: "configStatus",
  hasEndpoint: !!config.endpoint,
  hasAuth: status.state === "authenticated",
  hasModels: config.models.length > 0,
});
```

## Rationale

- **Auth status first** — the auth banner must render before the welcome card to preserve visual hierarchy (auth banner appears above welcome card in DOM insertion order)
- **After modelsUpdated** — `hasModels` mirrors the same config data already sent in `modelsUpdated`, so no extra async work needed
- **Booleans, not raw config** — the webview doesn't need the full config, just three presence flags; keeps the message surface minimal

## Impact on Tests

Tests that filter lifecycle messages by type and count total messages for `vi.waitFor()` timing must filter before counting. Adding `configStatus` to the filter-by-type list is not enough if the raw message count is used as the timing condition — it will pass before stream messages arrive. See `extension.test.ts` for the correct pattern:

```typescript
await vi.waitFor(() => {
  const filtered = getPostedMessages(mockView).filter((m) => {
    const t = m.type;
    return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus";
  });
  expect(filtered.length).toBeGreaterThanOrEqual(4);
});
```

Any future lifecycle messages added to `resolveWebviewView` must follow this same pattern.
