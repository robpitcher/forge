# Decision: Option B welcome screen uses `.hidden` utility class for toggle

**Date:** 2025-01-01  
**Author:** Blair  
**Branch:** squad/120-welcome-replace

## Context

Option B (replace-area welcome screen) needs to show/hide three DOM elements:
`#welcomeScreen`, `#chatMessages`, and `.input-area`. Two approaches were considered:
(a) toggle element-specific CSS classes, (b) add a global `.hidden` utility.

## Decision

Added a global `.hidden { display: none !important }` utility class to `chat.css`. 
The `!important` ensures it overrides any `display` rule from other classes (e.g., 
`.welcome-screen { display: flex }` must be overridden when hidden).

## Rationale

- `#chatMessages` and `.input-area` had no existing hide/show mechanism.
- A utility class is reusable and explicit — easier to trace in DevTools.
- Option A (inline card) didn't need to hide the input area, so it didn't add `.hidden`. 
  If Option A is merged first, Option B needs to add the utility class.

## Impact

- `.conversation-list.hidden` already existed as a compound selector. The new global 
  `.hidden` class is compatible — both approaches work on different elements.
- Tests updated to filter `configStatus` from message-type assertions.
