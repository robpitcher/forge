# Decision: getText mocks must be argument-aware

**Date:** 2026-03-02
**Decided by:** Windows (Tester)
**Context:** PR #119 review feedback on sendFromEditor.test.ts

## Decision

When mocking `document.getText()` in VS Code editor tests, always use `mockImplementation` with argument discrimination — not `mockReturnValue`. The mock must return different values depending on whether a range/selection argument is provided:

```typescript
getText: vi.fn().mockImplementation((range?: unknown) =>
  range ? selectionText : fullDocumentText,
)
```

## Rationale

The production code calls `getText(selection)` to get only the selected text. A constant `mockReturnValue` makes the test pass regardless of whether `getText()` or `getText(selection)` is called — silently hiding regressions where the code forgets to pass the selection argument.

## Scope

Applies to all test files that mock VS Code `TextDocument.getText()`.
