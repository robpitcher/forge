# Changelog

All notable changes to Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-03-05

### Added

- **Progress Indicator & Stop Button** — Real-time progress indicator during in-flight requests with ability to stop streaming responses
- **Workspace Awareness** — SDK workspace awareness via workingDirectory for better context handling
- **CLI Auto-Install** — Automatic installation and discovery of Copilot CLI with enhanced cross-platform support

### Changed

- **Package Rename** — Renamed package from "forge" to "forge-ai" with updated display name to "Forge AI"
- **CLI Discovery** — Enhanced CLI discovery logic to include global storage path validation on Windows
- **CLI Compatibility** — Improved CLI compatibility probing with enhanced spawn handling and error diagnostics
- **Documentation** — Restructured README with enterprise architecture diagrams and improved clarity

### Fixed

- **XSS Vulnerability** — Fixed client-side cross-site scripting vulnerability in markdown rendering
- **Windows Console** — Fixed console window popups from CLI spawning processes
- **CLI Entry Point** — Fixed Windows EFTYPE error when spawning .js CLI entry point
- **CLI Installation** — Prevented concurrent CLI install prompts and overlapping notifications
- **CLI Probe** — Fixed CLI compatibility probe to treat SIGTERM as successful completion
- **Error Messages** — Enhanced Copilot CLI and Entra ID authentication error messages with detailed diagnostics
- **CLI Path Resolution** — Fixed auto-resolution of Copilot CLI path to prevent .vsix import.meta.resolve failure
- **Model Initialization** — Fixed model selector display and improved auth timeout and logging
- **Azure CLI Prompts** — Enhanced Azure CLI installation prompts and documentation updates
- **Code Quality** — Refactored whitespace and improved type annotations in CLI installer

### Security

- XSS prevention in markdown content rendering

---

## [0.2.0] - 2026-03-04

> **⚠️ Pre-release (Alpha)** — Forge is in active development. Core features are functional; expect breaking changes.

### Added

- **Azure AI Foundry Integration** — Route all AI chat inference through your organization's private Azure AI Foundry endpoint using the GitHub Copilot SDK in BYOK (Bring Your Own Key) mode
- **Dual Authentication Methods** — Support for both Azure Entra ID (via `DefaultAzureCredential`) and static API Key authentication, selectable in settings
- **Multi-Model Support** — Switch between configured Azure AI Foundry deployment names via a dropdown in the chat UI
- **Code Context Attachments** — Attach code selection or files to prompts for in-context code explanations and edits
- **Editor Commands** — Explain, Fix, and Write Tests commands via right-click context menu or VS Code lightbulb (💡)
- **Conversation History** — Maintain multi-turn conversation state within a session
- **Air-Gapped & Compliance Ready** — All inference stays within your Azure tenant; no external network calls except to your configured private endpoint
- **Automatic CLI Installation** — Copilot CLI is auto-installed and managed by the extension
- **Configuration UI** — Settings panel for endpoint URL, authentication method, model selection, and tool configuration
- **Tool Support** — Shell, Read, Write, URL, and MCP (Model Context Protocol) tools with approval workflow
- **Webview Chat Interface** — Sidebar chat UI with Enter to send, Shift+Enter for newlines, real-time streaming responses

### Configuration

- `forge.copilot.endpoint` — Azure AI Foundry endpoint URL (required)
- `forge.copilot.authMethod` — `"entraId"` (default) or `"apiKey"` (secure)
- `forge.copilot.models` — Array of Azure AI Foundry deployment names for model selector
- `forge.copilot.wireApi` — API format: `"completions"` or `"responses"` (default: `"completions"`)
- `forge.copilot.cliPath` — Custom path to Copilot CLI binary (optional)
- `forge.copilot.systemMessage` — Append custom system message to default Copilot prompt
- `forge.copilot.autoApproveTools` — Auto-approve tool executions (default: false)
- `forge.copilot.tools.*` — Enable/disable individual tools (shell, read, write, url, mcp)
- `forge.copilot.mcpAllowRemote` — Allow remote (HTTP/SSE) MCP servers (default: false)
- `forge.copilot.mcpServers` — Configure local and remote MCP servers

---

## Version Links

- [Unreleased changes](https://github.com/robpitcher/forge/compare/v0.2.0...dev)
- [0.2.0 Release](https://github.com/robpitcher/forge/releases/tag/v0.2.0)
