# Session Log: UI Enhancements Feasibility

**Timestamp:** 2026-02-28T23:23:36Z  
**Topic:** ui-enhancements-feasibility  
**Participants:** MacReady, Blair, Rob (requester)

## Context

Rob Pitcher requested feasibility analysis for two UI enhancements to improve user experience:
1. **Model Selector Dropdown:** Allow users to select model from dropdown instead of editing settings
2. **Entra ID Auth UX:** Improve visibility and control of Entra ID authentication flow

## Analysis Conducted

### MacReady: Architecture & Feasibility
- Analyzed 4 approaches for model selector (Data Plane API, ARM API, Local Config, Hardcoded)
- Analyzed 4 auth UX options (Status Bar, Welcome View, Inline Prompt, Auth Provider)
- Evaluated trade-offs: reliability, air-gap compatibility, auth complexity, implementation effort
- **Key Finding:** Azure AI Foundry has no reliable "list models" API
- **Recommendation:** Use hardcoded model list (Approach D) for model selector
- **Recommendation:** Implement Status Bar + Inline Prompt for auth UX

### Blair: UI/Extension API Options
- Detailed UI implementation options for model selector (HTML select vs custom dropdown)
- Investigated Azure AI Foundry model listing API contract
- Designed message flow for webview ↔ extension communication
- Analyzed VS Code Authentication API integration for Entra ID
- Estimated implementation effort per feature across phases

## Decisions Made

### Enhancement 1: Model Selector
- **Implementation:** Hardcoded model list (gpt-4.1, gpt-5, gpt-4o, claude-opus, etc.) + "Custom..." option
- **UI:** HTML `<select>` dropdown in webview bottom bar
- **Behavior:** On model select, show confirmation dialog before destroying session
- **Phase:** Post-MVP (Phase 2 or later)
- **Rationale:** Zero network calls, works offline, covers 90% of deployments, ~80 lines

### Enhancement 2: Entra ID Auth UX
- **Phase 1 (MVP+1):** Status Bar Item + Inline Auth Prompt
  - Status bar shows: 🔒 Not Authenticated / ✅ Authenticated / ⚠️ Auth Error
  - Inline messages on chat attempts show auth status with actionable buttons
  - Display which credential source succeeded (Azure CLI, VS Code, Managed Identity)
- **Phase 2:** Add "Sign in with Azure" button using VS Code Authentication API
- **Rationale:** Low-medium effort (~100 lines), high UX impact, no architecture changes

## GitHub Issues Created

- **#80:** Improve Entra ID Authentication UX (Status Bar + Inline Prompt)
  - Priority: Phase 3b (post-DefaultAzureCredential implementation)
  - Owners: Blair (UI), Childs (auth metadata)
- **#81:** Add Model Selector Dropdown to Chat UI
  - Priority: Phase 2 or later
  - Owner: TBD (awaiting Rob's scope decision)

## Outcomes

✅ Clear feasibility assessment with phased recommendations  
✅ Implementation effort estimated for each feature  
✅ Issues #80 and #81 created for team backlog  
✅ Decision inbox populated with detailed analysis documents  

## Open Questions for Rob

1. Model selector priority: P0 for MVP or P2+?
2. Auth method preference: Prioritize VS Code auth or Azure CLI?
3. Air-gap implications: Can model list API require network call?
4. Session context: Acceptable UX to lose chat history on model switch?
