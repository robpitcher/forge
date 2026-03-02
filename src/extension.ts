import * as vscode from "vscode";
import * as crypto from "crypto";
import { getConfigurationAsync, validateConfiguration } from "./configuration.js";
import { createCredentialProvider } from "./auth/credentialProvider.js";
import {
  getOrCreateSession,
  destroySession,
  stopClient,
  CopilotCliNotFoundError,
  listConversations,
  resumeConversation,
  deleteConversation,
} from "./copilotService.js";
import { checkAuthStatus, type AuthStatus } from "./auth/authStatusProvider.js";
import { ForgeCodeActionProvider } from "./codeActionProvider.js";
import type {
  ICopilotSession,
  MessageDeltaEvent,
  AssistantMessageEvent,
  SessionErrorEvent,
  PermissionRequest,
  PermissionRequestResult,
  ToolExecutionProgressEvent,
  ToolExecutionPartialResultEvent,
  ToolExecutionCompleteEvent,
  ContextItem,
} from "./types.js";

const AUTH_POLL_INTERVAL_MS = 30_000;
const SIGN_IN_RECHECK_MS = 5000;
const TOOL_PERMISSION_TIMEOUT_MS = 120_000;

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel("Forge");
  const provider = new ChatViewProvider(context.extensionUri, context.secrets, context.workspaceState);
  
  // Status bar item for auth status
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  statusBarItem.show();
  
  // Wire auth refresh callback so provider methods can trigger status updates
  const refreshAuth = () => {
    updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => { outputChannel.appendLine(`Auth status update failed: ${err}`); });
  };
  provider.setAuthRefreshCallback(refreshAuth);
  
  // Initial auth status update
  updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => {
    outputChannel.appendLine(`Initial auth status check failed: ${err}`);
  });
  
  // Listen for config changes
  const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("forge.copilot")) {
      updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => {
        outputChannel.appendLine(`Auth status update on config change failed: ${err}`);
      });
    }
  });
  
  // Poll auth status every 30s (catches `az login` completions that don't trigger config changes)
  const authPollInterval = setInterval(() => {
    updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => { outputChannel.appendLine(`Auth status update failed: ${err}`); });
  }, AUTH_POLL_INTERVAL_MS);
  const authPollDisposable = new vscode.Disposable(() => clearInterval(authPollInterval));
  
  // Re-check auth when the window regains focus
  const focusListener = vscode.window.onDidChangeWindowState((e) => {
    if (e.focused) {
      updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => { outputChannel.appendLine(`Auth status update failed: ${err}`); });
    }
  });
  
  // Track sign-in timeout so it can be disposed on deactivation
  let signInTimeoutHandle: ReturnType<typeof setTimeout> | undefined;
  
  context.subscriptions.push(
    outputChannel,
    statusBarItem,
    configListener,
    authPollDisposable,
    focusListener,
    new vscode.Disposable(() => {
      if (signInTimeoutHandle !== undefined) {
        clearTimeout(signInTimeoutHandle);
        signInTimeoutHandle = undefined;
      }
    }),
    vscode.window.registerWebviewViewProvider("forge.chatView", provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("forge.openSettings", () =>
      provider.openSettings()
    ),
    vscode.commands.registerCommand("forge.showHistory", () =>
      provider.toggleHistory()
    ),
    vscode.commands.registerCommand("forge.signIn", async () => {
      const config = await getConfigurationAsync(context.secrets);
      if (config.authMethod === "entraId") {
        const terminal = vscode.window.createTerminal("Azure Sign In");
        terminal.sendText("az login");
        terminal.show();
        // Re-check auth after a few seconds to pick up the new token
        if (signInTimeoutHandle !== undefined) {
          clearTimeout(signInTimeoutHandle);
        }
        signInTimeoutHandle = setTimeout(() => {
          signInTimeoutHandle = undefined;
          updateAuthStatus(statusBarItem, provider, context.secrets).catch((err) => { outputChannel.appendLine(`Auth status update failed: ${err}`); });
        }, SIGN_IN_RECHECK_MS);
      } else {
        await provider.openSettings();
      }
    }),
    vscode.commands.registerCommand("forge.attachSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.selection;
      const content = editor.document.getText(selection);
      if (!content) { return; }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const startLine = selection.start.line + 1;
      let endLine = selection.end.line + 1;
      if (selection.end.character === 0 && selection.end.line > selection.start.line) {
        // Selection ends at the start of the next line; make endLine inclusive.
        endLine = selection.end.line;
      }
      const ctx: ContextItem = {
        type: "selection",
        filePath,
        languageId: editor.document.languageId,
        content,
        startLine,
        endLine,
      };
      provider.postContextAttached(ctx);
    }),
    vscode.commands.registerCommand("forge.attachFile", async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
      });
      if (!uris || uris.length === 0) { return; }
      const uri = uris[0];
      const raw = await vscode.workspace.fs.readFile(uri);
      let content = new TextDecoder("utf-8").decode(raw);
      if (content.length > ChatViewProvider.CONTEXT_CHAR_BUDGET) {
        content = content.slice(0, ChatViewProvider.CONTEXT_CHAR_BUDGET) + "\n...[truncated]";
      }
      const filePath = vscode.workspace.asRelativePath(uri);
      // Derive languageId from file extension — no document open required
      const ext = filePath.split(".").pop() ?? "";
      const langMap: Record<string, string> = {
        ts: "typescript", tsx: "typescriptreact", js: "javascript", jsx: "javascriptreact",
        py: "python", rs: "rust", go: "go", java: "java", css: "css", html: "html",
        json: "json", md: "markdown", yaml: "yaml", yml: "yaml", sh: "shellscript",
      };
      const languageId = langMap[ext] ?? ext;
      const ctx: ContextItem = { type: "file", filePath, languageId, content };
      provider.postContextAttached(ctx);
    }),
    vscode.languages.registerCodeActionsProvider(
      [{ scheme: "file" }, { scheme: "untitled" }],
      new ForgeCodeActionProvider(),
      { providedCodeActionKinds: ForgeCodeActionProvider.providedCodeActionKinds },
    ),
    vscode.commands.registerCommand("forge.explain", () =>
      sendFromEditor("Explain the following code in detail.", provider)
    ),
    vscode.commands.registerCommand("forge.fix", () =>
      sendFromEditor("Find and fix any bugs or issues in the following code.", provider)
    ),
    vscode.commands.registerCommand("forge.tests", () =>
      sendFromEditor("Write unit tests for the following code.", provider)
    ),
  );
}

/**
 * Grabs the active editor selection, reveals the Forge panel, and sends
 * a prompt with the selected code as context.
 */
async function sendFromEditor(instruction: string, provider: ChatViewProvider): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) { return; }
  const selection = editor.selection;
  const content = editor.document.getText(selection);
  if (!content) { return; }

  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const startLine = selection.start.line + 1;
  let endLine = selection.end.line + 1;
  if (selection.end.character === 0 && selection.end.line > selection.start.line) {
    endLine = selection.end.line;
  }

  const ctx: ContextItem = {
    type: "selection",
    filePath,
    languageId: editor.document.languageId,
    content,
    startLine,
    endLine,
  };

  // Reveal the Forge panel so the user sees the response
  await vscode.commands.executeCommand("forge.chatView.focus");

  provider.sendMessageWithContext(instruction, [ctx]);
}

async function updateAuthStatus(
  statusBarItem: vscode.StatusBarItem,
  provider: ChatViewProvider,
  secrets: vscode.SecretStorage
): Promise<void> {
  const config = await getConfigurationAsync(secrets);
  const status = await checkAuthStatus(config, secrets);
  
  switch (status.state) {
    case "authenticated":
      statusBarItem.text = "$(pass) Forge: Authenticated";
      if (status.method === "entraId" && status.account) {
        statusBarItem.tooltip = `Signed in as ${status.account} (Entra ID)`;
      } else {
        statusBarItem.tooltip = `Authenticated via ${status.method === "entraId" ? "Entra ID" : "API Key"}`;
      }
      statusBarItem.command = undefined;
      break;
    case "notAuthenticated":
      statusBarItem.command = "forge.signIn";
      if (config.authMethod === "entraId") {
        statusBarItem.text = "$(sign-in) Forge: Sign In";
        statusBarItem.tooltip = "Click to sign in with Azure CLI";
      } else {
        statusBarItem.text = "$(key) Forge: Set API Key";
        statusBarItem.tooltip = "Click to set your API key";
      }
      break;
    case "error": {
      statusBarItem.command = "forge.signIn";
      statusBarItem.text = "$(warning) Forge: Auth Issue";
      const msg = status.message ?? "Unknown error";
      statusBarItem.tooltip = msg.length > 80 ? msg.slice(0, 80) + "…" : msg;
      break;
    }
  }
  
  provider.postAuthStatus(status, !!config.endpoint);
}

export async function deactivate(): Promise<void> {
  await stopClient();
}

class ChatViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _conversationId: string = `conv-${crypto.randomUUID()}`;
  private _isProcessing = false;
  private _messageListener?: vscode.Disposable;
  private _pendingPermissions = new Map<string, (approved: boolean) => void>();
  private _conversationMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  private _refreshAuthStatus?: () => void;
  private _lastAuthStatus?: string;
  private _selectedModel?: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _secrets: vscode.SecretStorage,
    private readonly _workspaceState: vscode.Memento
  ) {
    // Restore persisted model selection
    this._selectedModel = this._workspaceState.get<string>("forge.selectedModel");
  }

  /** Set by activate() to trigger auth status refresh from within the provider. */
  public setAuthRefreshCallback(callback: () => void): void {
    this._refreshAuthStatus = callback;
  }

  /** Returns the active model: persisted selection, or first entry from models array. */
  private _getActiveModel(models: string[]): string {
    if (this._selectedModel && models.includes(this._selectedModel)) {
      return this._selectedModel;
    }
    return models[0] ?? "";
  }

  public postContextAttached(context: ContextItem): void {
    this._view?.webview.postMessage({ type: "contextAttached", context });
  }

  public toggleHistory(): void {
    this._view?.webview.postMessage({ type: "toggleHistory" });
  }

  /** Programmatically send a message with context (used by code action commands). */
  public sendMessageWithContext(prompt: string, context: ContextItem[]): void {
    this._handleChatMessage(prompt, context).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
    });
  }

  public postAuthStatus(status: AuthStatus, hasEndpoint?: boolean): void {
    // Deduplicate authStatus messages to prevent banner flashing every 30s
    const statusKey = JSON.stringify({ status, hasEndpoint: !!hasEndpoint });
    if (this._lastAuthStatus === statusKey) {
      return; // Status unchanged, skip posting to webview
    }
    this._lastAuthStatus = statusKey;
    this._view?.webview.postMessage({ type: "authStatus", status, hasEndpoint: !!hasEndpoint });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    this._messageListener?.dispose();
    this._messageListener = webviewView.webview.onDidReceiveMessage(
      this._handleMessage.bind(this)
    );
    webviewView.onDidDispose(() => {
      this._messageListener?.dispose();
      this._messageListener = undefined;
    });
    
    // Reset dedup state so initial status always goes through
    this._lastAuthStatus = undefined;
    
    // Send initial auth status
    getConfigurationAsync(this._secrets)
      .then(async (config) => {
        const status = await checkAuthStatus(config, this._secrets);
        this.postAuthStatus(status, !!config.endpoint);
        this._view?.webview.postMessage({ type: "modelsUpdated", models: config.models });
        this._view?.webview.postMessage({ type: "modelSelected", model: this._getActiveModel(config.models) });
        this._view?.webview.postMessage({
          type: "configStatus",
          hasEndpoint: !!config.endpoint,
          hasAuth: status.state === "authenticated",
          hasModels: config.models.length > 0,
        });
      })
      .catch(() => {
        // Silent failure — status bar will show the error
      });
  }

  public async openSettings(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      ["Open Settings", "Set API Key (secure)"],
      { placeHolder: "Forge Configuration" }
    );
    if (choice === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "forge.copilot");
    } else if (choice === "Set API Key (secure)") {
      await this._promptAndStoreApiKey();
    }
  }

  /** Shared helper: prompt for API key, store in SecretStorage, refresh auth status. */
  private async _promptAndStoreApiKey(): Promise<void> {
    const value = await vscode.window.showInputBox({
      prompt: "Enter your API key",
      password: true,
      placeHolder: "Paste your Azure AI Foundry API key",
    });
    if (value !== undefined) {
      await this._secrets.store("forge.copilot.apiKey", value);
      await vscode.window.showInformationMessage("API key stored securely.");
      this._refreshAuthStatus?.();
    }
  }

  private async _handleMessage(message: { command: string; [key: string]: unknown }): Promise<void> {
    if (message.command === "sendMessage") {
      const rawContext = Array.isArray(message.context) ? message.context : undefined;
      const context = rawContext?.filter(
        (item: unknown): item is ContextItem =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Record<string, unknown>).type === "string" &&
          typeof (item as Record<string, unknown>).content === "string" &&
          typeof (item as Record<string, unknown>).filePath === "string" &&
          typeof (item as Record<string, unknown>).languageId === "string"
      );
      await this._handleChatMessage((message.text as string) ?? "", context && context.length > 0 ? context : undefined);
    } else if (message.command === "attachSelection") {
      await vscode.commands.executeCommand("forge.attachSelection");
    } else if (message.command === "attachFile") {
      await vscode.commands.executeCommand("forge.attachFile");
    } else if (message.command === "openSettings") {
      await this.openSettings();
    } else if (message.command === "openEndpointSettings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "forge.copilot.endpoint");
    } else if (message.command === "openModelSettings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "forge.copilot.models");
    } else if (message.command === "signIn") {
      await vscode.commands.executeCommand("forge.signIn");
    } else if (message.command === "setApiKey") {
      await this._promptAndStoreApiKey();
    } else if (message.command === "newConversation") {
      this._rejectPendingPermissions();
      await destroySession(this._conversationId);
      this._conversationId = `conv-${crypto.randomUUID()}`;
      this._conversationMessages = [];
      this._view?.webview.postMessage({ type: "conversationReset" });
    } else if (message.command === "modelChanged") {
      const newModel = message.model as string;
      if (!newModel) { return; }
      const confirm = await vscode.window.showWarningMessage(
        "Changing models will reset the current conversation. Continue?",
        { modal: true },
        "Continue"
      );
      if (confirm !== "Continue") {
        const currentConfig = await getConfigurationAsync(this._secrets);
        this._view?.webview.postMessage({ type: "modelSelected", model: this._getActiveModel(currentConfig.models) });
        return;
      }
      this._selectedModel = newModel;
      await this._workspaceState.update("forge.selectedModel", newModel);
      this._rejectPendingPermissions();
      await destroySession(this._conversationId);
      this._conversationId = `conv-${crypto.randomUUID()}`;
      this._conversationMessages = [];
      this._view?.webview.postMessage({ type: "conversationReset" });
      this._view?.webview.postMessage({ type: "modelSelected", model: newModel });
    } else if (message.command === "chatFocused") {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.selection;
      let content = editor.document.getText(selection);
      if (!content) { return; }
      if (content.length > ChatViewProvider.CONTEXT_CHAR_BUDGET) {
        content = content.slice(0, ChatViewProvider.CONTEXT_CHAR_BUDGET) + "\n...[truncated]";
      }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const startLine = selection.start.line + 1;
      let endLine = selection.end.line + 1;
      if (selection.end.character === 0 && selection.end.line > selection.start.line) {
        // Selection ends at the start of the next line; make endLine inclusive.
        endLine = selection.end.line;
      }
      const ctx: ContextItem = {
        type: "selection",
        filePath,
        languageId: editor.document.languageId,
        content,
        startLine,
        endLine,
      };
      this._view?.webview.postMessage({ type: "contextAttached", context: ctx, autoAttached: true });
    } else if (message.command === "toolResponse") {
      const { id, approved } = message;
      if (typeof id !== "string" || id.length === 0) {
        console.warn("[forge] Received toolResponse with invalid id:", id);
        return;
      }
      if (typeof approved !== "boolean") {
        console.warn(
          "[forge] Received toolResponse with non-boolean approved value; defaulting to deny.",
          approved
        );
      }
      const resolver = this._pendingPermissions.get(id);
      if (!resolver) {
        console.warn(
          "[forge] No pending permission request found for toolResponse id:",
          id
        );
        return;
      }
      resolver(approved === true);
    } else if (message.command === "listConversations") {
      await this._handleListConversations();
    } else if (message.command === "resumeConversation") {
      await this._handleResumeConversation(message.sessionId as string);
    } else if (message.command === "deleteConversation") {
      await this._handleDeleteConversation(message.sessionId as string);
    }
  }

  private async _handleChatMessage(prompt: string, context?: ContextItem[]): Promise<void> {
    if (this._isProcessing) { return; }
    this._isProcessing = true;

    let config: Awaited<ReturnType<typeof getConfigurationAsync>>;
    try {
      config = await getConfigurationAsync(this._secrets);
    } catch {
      this._postError("Failed to read API key from secure storage. Click the ⚙️ gear icon → 'Set API Key (secure)' to re-enter it.");
      this._isProcessing = false;
      return;
    }
    const validationErrors = validateConfiguration(config);

    if (validationErrors.length > 0) {
      for (const error of validationErrors) {
        this._postError(error.message);
      }
      this._isProcessing = false;
      return;
    }

    let credentialProvider;
    try {
      credentialProvider = await createCredentialProvider(config, this._secrets);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(`Failed to initialize authentication: ${message}. Click ⚙️ to check your auth settings.`);
      this._isProcessing = false;
      return;
    }
    let authToken: string;
    try {
      authToken = await credentialProvider.getToken();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (config.authMethod === "entraId") {
        this._postError(
          "Entra ID authentication failed. Ensure you're signed in via Azure CLI, " +
          "VS Code Azure Account extension, or running on a VM with Managed Identity. " +
          "Alternatively, switch to API key auth in Settings (forge.copilot.authMethod). " +
          `Details: ${message}`
        );
      } else {
        this._postError(`Authentication failed: ${message}`);
      }
      this._isProcessing = false;
      return;
    }

    let session: ICopilotSession;
    try {
      session = await getOrCreateSession(
        this._conversationId,
        config,
        authToken,
        this._getActiveModel(config.models),
        this._createPermissionHandler(),
      );
    } catch (err: unknown) {
      if (err instanceof CopilotCliNotFoundError) {
        this._postError(err.message);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this._postError(`Failed to start Copilot service: ${message}`);
      }
      this._isProcessing = false;
      return;
    }

    const enrichedPrompt = this._buildPromptWithContext(prompt, context);

    try {
      // Add user message to cache
      this._conversationMessages.push({ role: "user", content: prompt });

      await this._streamResponse(enrichedPrompt, session);

      // Cache messages after successful response
      const cacheKey = `forge.messages.${this._conversationId}`;
      await this._workspaceState.update(cacheKey, this._conversationMessages);
      
      // Store as last session
      await this._workspaceState.update("forge.lastSessionId", this._conversationId);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = this._rewriteAuthError(raw);
      this._postError(message);
      await destroySession(this._conversationId);
    } finally {
      this._isProcessing = false;
    }
  }

  public static readonly CONTEXT_CHAR_BUDGET = 8000;

  /**
   * Prepend formatted workspace context blocks to the user's prompt.
   *
   * Each context item becomes a fenced code block with a header line.
   * Total context (excluding the user prompt) is capped at 8 000 chars;
   * if exceeded, the last item's content is truncated to fit.
   */
  private _buildPromptWithContext(prompt: string, context?: ContextItem[]): string {
    if (!context || context.length === 0) {
      return prompt;
    }

    const budget = ChatViewProvider.CONTEXT_CHAR_BUDGET;
    const truncationNote = "\n...[truncated — context exceeds 8000 char limit]";
    const separator = "\n\n";
    let usedChars = 0;
    const blocks: string[] = [];

    for (const item of context) {
      const header = item.type === "selection" && item.startLine != null && item.endLine != null
        ? `--- Context: ${item.filePath}:${item.startLine}-${item.endLine} (${item.languageId}) ---`
        : `--- Context: ${item.filePath} (${item.languageId}) ---`;

      const fence = `\`\`\`${item.languageId}`;
      const fenceClose = "```";

      // Build the full block to measure its length
      const fullBlock = `${header}\n${fence}\n${item.content}\n${fenceClose}`;
      // Account for the "\n\n" separator that joins blocks (and precedes the prompt)
      const separatorCost = blocks.length === 0 ? separator.length : separator.length * 2;

      if (usedChars + fullBlock.length + separatorCost <= budget) {
        blocks.push(fullBlock);
        usedChars += fullBlock.length + separatorCost;
      } else {
        // Truncate this item's content to fit within the remaining budget
        const shell = `${header}\n${fence}\n`;
        const tail = `\n${fenceClose}${truncationNote}`;
        const available = budget - usedChars - shell.length - tail.length - separatorCost;

        if (available > 0) {
          blocks.push(`${shell}${item.content.slice(0, available)}${tail}`);
        } else {
          // No room even for the shell — emit header + truncation note only
          blocks.push(`${header}${truncationNote}`);
        }
        break; // budget exhausted; drop remaining items
      }
    }

    return blocks.join(separator) + separator + prompt;
  }

  /** Rewrites SDK auth errors to point users at the settings gear. */
  private _rewriteAuthError(message: string): string {
    const lower = message.toLowerCase();
    if (lower.includes("authorization") || lower.includes("401") || lower.includes("unauthorized") || lower.includes("/login")) {
      return "API key is missing or invalid. Click the ⚙️ gear icon → 'Set API Key (secure)' to update it.";
    }
    return message;
  }

  private _streamResponse(prompt: string, session: ICopilotSession): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._view?.webview.postMessage({ type: "streamStart" });

      let settled = false;
      let accumulatedContent = "";
      const cleanup = () => {
        unsubDelta();
        unsubMessage();
        unsubIdle();
        unsubError();
        unsubToolProgress();
        unsubToolPartialResult();
        unsubToolComplete();
      };

      const unsubMessage = session.on("assistant.message", (event: AssistantMessageEvent) => {
        if (event?.data?.content) {
          accumulatedContent = event.data.content;
        }
      });

      const unsubDelta = session.on("assistant.message_delta", (event: MessageDeltaEvent) => {
        if (event?.data?.deltaContent) {
          accumulatedContent += event.data.deltaContent;
          this._view?.webview.postMessage({
            type: "streamDelta",
            content: event.data.deltaContent,
          });
        }
      });

      const unsubToolProgress = session.on("tool.execution_progress", (event: ToolExecutionProgressEvent) => {
        if (event?.data?.toolCallId && event?.data?.progressMessage) {
          this._view?.webview.postMessage({
            type: "toolProgress",
            id: event.data.toolCallId,
            message: event.data.progressMessage,
          });
        }
      });

      const unsubToolPartialResult = session.on("tool.execution_partial_result", (event: ToolExecutionPartialResultEvent) => {
        if (event?.data?.toolCallId && event?.data?.partialOutput) {
          this._view?.webview.postMessage({
            type: "toolPartialResult",
            id: event.data.toolCallId,
            output: event.data.partialOutput,
          });
        }
      });

      const unsubToolComplete = session.on("tool.execution_complete", (event: ToolExecutionCompleteEvent) => {
        const toolCallId = event?.data?.toolCallId;
        if (toolCallId && this._view) {
          this._view.webview.postMessage({
            type: "toolComplete",
            id: toolCallId,
          });
        }
      });

      const unsubIdle = session.on("session.idle", () => {
        if (settled) { return; }
        settled = true;
        cleanup();
        
        // Add assistant message to cache
        if (accumulatedContent) {
          this._conversationMessages.push({ role: "assistant", content: accumulatedContent });
        }
        
        this._view?.webview.postMessage({ type: "streamEnd" });
        resolve();
      });

      const unsubError = session.on("session.error", (event: SessionErrorEvent) => {
        if (settled) { return; }
        settled = true;
        cleanup();
        const message = event?.data?.message ?? "Unknown session error";
        reject(new Error(message));
      });

      session.send({ prompt }).catch((err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });
    });
  }

  private _createPermissionHandler() {
    return async (
      request: PermissionRequest,
      _invocation: { sessionId: string },
    ): Promise<PermissionRequestResult> => {
      const config = vscode.workspace.getConfiguration("forge.copilot");
      const autoApprove = config.get<boolean>("autoApproveTools", false);

      if (autoApprove) {
        return { kind: "approved" };
      }

      const toolCallId = request.toolCallId ?? crypto.randomUUID();
      this._view?.webview.postMessage({
        type: "toolConfirmation",
        id: toolCallId,
        tool: request.kind,
        params: request,
      });

      const timeoutMs = TOOL_PERMISSION_TIMEOUT_MS;

      return new Promise<PermissionRequestResult>((resolve) => {
        const timeoutHandle = setTimeout(() => {
          // If still pending when the timeout fires, deny the request
          const resolver = this._pendingPermissions.get(toolCallId);
          if (resolver) {
            this._view?.webview.postMessage({ type: "toolTimeout", id: toolCallId });
            resolver(false);
          }
        }, timeoutMs);

        const resolver = (approved: boolean) => {
          // If this entry was already resolved/removed, do nothing
          if (!this._pendingPermissions.has(toolCallId)) {
            return;
          }

          this._pendingPermissions.delete(toolCallId);
          clearTimeout(timeoutHandle);

          resolve({
            kind: approved ? "approved" : "denied-interactively-by-user",
          });
        };

        this._pendingPermissions.set(toolCallId, resolver);
      });
    };
  }

  private _rejectPendingPermissions(): void {
    this._pendingPermissions.forEach((resolver) => {
      resolver(false);
    });
    this._pendingPermissions.clear();
  }

  private _postError(message: string): void {
    this._view?.webview.postMessage({ type: "error", message });
  }

  private async _handleListConversations(): Promise<void> {
    try {
      const config = await getConfigurationAsync(this._secrets);
      const conversations = await listConversations(config);
      this._view?.webview.postMessage({ type: "conversationList", conversations });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
    }
  }

  private async _handleResumeConversation(sessionId: string): Promise<void> {
    if (!sessionId) {
      this._postError("Invalid session ID");
      return;
    }
    if (typeof sessionId !== "string" || sessionId.length > 200) {
      this._postError("Invalid session ID.");
      return;
    }

    try {
      const config = await getConfigurationAsync(this._secrets);
      const validationErrors = validateConfiguration(config);
      if (validationErrors.length > 0) {
        for (const error of validationErrors) {
          this._postError(error.message);
        }
        return;
      }

      const credentialProvider = await createCredentialProvider(config, this._secrets);
      let authToken: string;
      try {
        authToken = await credentialProvider.getToken();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (config.authMethod === "entraId") {
          this._postError(
            "Entra ID authentication failed. Ensure you're signed in via Azure CLI. " +
            `Details: ${message}`
          );
        } else {
          this._postError(`Authentication failed: ${message}`);
        }
        return;
      }

      // Destroy current session
      this._rejectPendingPermissions();
      await destroySession(this._conversationId);

      // Resume the selected conversation
      await resumeConversation(sessionId, config, authToken, this._getActiveModel(config.models), this._createPermissionHandler());
      this._conversationId = sessionId;

      // Restore cached messages from workspaceState
      const cacheKey = `forge.messages.${sessionId}`;
      const cachedMessages = this._workspaceState.get<Array<{ role: "user" | "assistant"; content: string }>>(cacheKey, []);
      this._conversationMessages = cachedMessages;

      // Store as last session
      await this._workspaceState.update("forge.lastSessionId", sessionId);

      // Send to webview
      this._view?.webview.postMessage({
        type: "conversationResumed",
        sessionId,
        messages: cachedMessages,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
    }
  }

  private async _handleDeleteConversation(sessionId: string): Promise<void> {
    if (!sessionId) {
      this._postError("Invalid session ID");
      return;
    }
    if (typeof sessionId !== "string" || sessionId.length > 200) {
      this._postError("Invalid session ID.");
      return;
    }

    try {
      const config = await getConfigurationAsync(this._secrets);
      await deleteConversation(sessionId, config);

      // Remove cached messages
      const cacheKey = `forge.messages.${sessionId}`;
      await this._workspaceState.update(cacheKey, undefined);

      // Send updated conversation list
      await this._handleListConversations();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "chat.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "chat.js")
    );

    const nonce = crypto.randomUUID();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link href="${styleUri}" rel="stylesheet">
    <title>Forge Chat</title>
</head>
<body>
    <div class="container">
        <div id="conversationList" class="conversation-list hidden"></div>
        <div id="welcomeScreen" class="welcome-screen hidden">
          <!-- Populated by JS when configuration is incomplete -->
        </div>
        <div id="chatMessages"></div>
        <div class="input-area">
            <div class="context-actions">
                <button class="context-btn" id="attachSelection">📎 Selection</button>
                <button class="context-btn" id="attachFile">📄 File</button>
            </div>
            <div id="contextChips"></div>
            <textarea id="userInput" placeholder="Ask a question..." rows="3"></textarea>
            <div class="button-row">
                <button id="sendBtn">Send</button>
                <button id="newConvBtn">New Conversation</button>
                <select id="modelSelector" title="Select model deployment"></select>
            </div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
