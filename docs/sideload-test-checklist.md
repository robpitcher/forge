# Sideload Test Checklist

**Purpose:** Manual verification that the Enclave extension can be installed and used on a clean VS Code instance.

**Validates:** Success Criterion SC6 — "The extension can be packaged as `.vsix` and sideloaded onto a clean VS Code installation."

---

## Prerequisites

- Clean VS Code installation (no prior Enclave installation)
- Access to Azure AI Foundry endpoint (URL, API key, model name)
- Node.js 20.19.0+ and npm installed (for building the `.vsix`)

---

## Build the .vsix

1. **Clone the repository:**
   ```bash
   git clone https://github.com/robpitcher/enclave.git
   cd enclave
   git checkout dev
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the .vsix package:**
   ```bash
   npm run package
   ```

4. **Verify .vsix file:**
   - Check that `enclave-0.1.0.vsix` exists in the project root
   - Verify file size is under 10 MB (should be ~40 KB)
   ```bash
   ls -lh enclave-0.1.0.vsix
   ```

---

## Installation Test

1. **Install the extension:**
   - In VS Code, open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run: `Extensions: Install from VSIX...`
   - Select `enclave-0.1.0.vsix`
   - Wait for installation to complete

2. **Verify installation:**
   - ✅ Installation completes without errors
   - ✅ VS Code does not prompt to reload

3. **Locate the extension:**
   - Open Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
   - Search for "Enclave"
   - ✅ Extension appears with name "Enclave"
   - ✅ Version shows `0.1.0`

---

## Activation Test

1. **Open the Enclave sidebar:**
   - Look for the Enclave icon in the Activity Bar (left sidebar)
   - Click the icon
   - ✅ "AI Chat" panel opens in the sidebar
   - ✅ Extension activates (check in Output > Log (Extension Host) if needed)

2. **Verify UI:**
   - ✅ Sidebar shows:
     - Text input field at the bottom
     - "Send" button
     - "New Conversation" button
     - Chat message container (empty initially)

---

## Configuration Test

1. **Attempt to send a message before configuration:**
   - Type "Hello" in the input field
   - Click "Send"
   - ✅ Error message appears: "⚠️ Missing required configuration: enclave.copilot.endpoint"
   - ✅ Error lists all missing required settings

2. **Configure the extension:**
   - Open Settings (`Ctrl+,` / `Cmd+,`)
   - Search for "Enclave"
   - Set the following:
     - `Enclave: Copilot Endpoint` — Your Azure AI Foundry endpoint URL
     - `Enclave: Copilot Api Key` — Your API key
     - `Enclave: Copilot Model` — Your model deployment name (e.g., `gpt-4.1`)
     - `Enclave: Copilot Wire Api` — `completions` (default)
   - ✅ All settings save without errors

---

## Basic Chat Test

1. **Send a message:**
   - Return to the Enclave sidebar
   - Type "What is TypeScript?" in the input field
   - Click "Send"

2. **Verify response:**
   - ✅ User message appears in the chat history
   - ✅ Assistant response streams in (tokens appear incrementally)
   - ✅ Response completes without errors
   - ✅ Response is relevant to the question

3. **Test multi-turn conversation:**
   - Send a follow-up: "Can you give an example?"
   - ✅ Assistant responds with context from previous message
   - ✅ Conversation history is maintained

4. **Test new conversation:**
   - Click "New Conversation" button
   - ✅ Chat history clears
   - Send a message: "Hello"
   - ✅ Assistant responds without context from previous conversation

---

## Error Handling Test

1. **Test network error (optional):**
   - Temporarily set an invalid endpoint in settings
   - Send a message
   - ✅ Error message appears in the chat
   - ✅ Extension does not crash

2. **Test cancellation (optional):**
   - Send a message with a long response
   - Click "New Conversation" while response is streaming
   - ✅ Response stops streaming
   - ✅ No errors appear

---

## Uninstallation Test

1. **Uninstall the extension:**
   - Open Extensions view
   - Find "Enclave"
   - Click the gear icon → "Uninstall"
   - Reload VS Code if prompted

2. **Verify cleanup:**
   - ✅ Extension is removed from Extensions list
   - ✅ Activity Bar icon is removed
   - ✅ No errors appear in the console

---

## Test Result Summary

**Date:** `YYYY-MM-DD`  
**VS Code Version:** `X.XX.X`  
**OS:** `Windows / macOS / Linux`  
**Tester:** `Your Name`

| Test Section | Pass/Fail | Notes |
|--------------|-----------|-------|
| Build .vsix | ☐ | |
| Installation | ☐ | |
| Activation | ☐ | |
| Configuration | ☐ | |
| Basic Chat | ☐ | |
| Error Handling | ☐ | |
| Uninstallation | ☐ | |

**Overall Result:** ☐ Pass / ☐ Fail

**Issues Found:**
- (List any issues discovered during testing)

---

## Notes

- **vsix Size:** The packaged extension should be under 10 MB (NFR8). Current size is ~40 KB.
- **No Internet Required:** All tests should work in an air-gapped environment (except for communication with the configured Azure AI Foundry endpoint).
- **No GitHub Auth:** The extension does not require GitHub authentication.
- **Activation Event:** The extension activates when the Enclave sidebar is opened (`onView:enclave.chatView`).
