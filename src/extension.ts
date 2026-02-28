import * as vscode from "vscode";
import * as crypto from "crypto";
import { getConfigurationAsync, validateConfiguration } from "./configuration.js";
import {
  getOrCreateSession,
  destroySession,
  stopClient,
  CopilotCliNotFoundError,
} from "./copilotService.js";
import type {
  ICopilotSession,
  MessageDeltaEvent,
  SessionErrorEvent,
  PermissionRequest,
  PermissionRequestResult,
  ToolExecutionStartEvent,
  ToolExecutionCompleteEvent,
  ContextItem,
} from "./types.js";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri, context.secrets);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("forge.chatView", provider),
    vscode.commands.registerCommand("forge.openSettings", () =>
      provider.openSettings()
    ),
    vscode.commands.registerCommand("forge.attachSelection", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.selection;
      const content = editor.document.getText(selection);
      if (!content) { return; }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const ctx: ContextItem = {
        type: "selection",
        filePath,
        languageId: editor.document.languageId,
        content,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
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
      if (content.length > 8000) {
        content = content.slice(0, 8000) + "\n...[truncated]";
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
  );
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
  private _toolNames = new Map<string, string>();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _secrets: vscode.SecretStorage
  ) {}

  public postContextAttached(context: ContextItem): void {
    this._view?.webview.postMessage({ type: "contextAttached", context });
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
  }

  public async openSettings(): Promise<void> {
    const choice = await vscode.window.showQuickPick(
      ["Open Settings", "Set API Key (secure)"],
      { placeHolder: "Forge Configuration" }
    );
    if (choice === "Open Settings") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "forge.copilot");
    } else if (choice === "Set API Key (secure)") {
      const value = await vscode.window.showInputBox({
        prompt: "Enter your API key",
        password: true,
        placeHolder: "Paste your Azure AI Foundry API key",
      });
      if (value !== undefined) {
        await this._secrets.store("forge.copilot.apiKey", value);
        await vscode.window.showInformationMessage("API key stored securely.");
      }
    }
  }

  private async _handleMessage(message: { command: string; [key: string]: unknown }): Promise<void> {
    if (message.command === "sendMessage") {
      const context = Array.isArray(message.context)
        ? (message.context as ContextItem[])
        : undefined;
      await this._handleChatMessage((message.text as string) ?? "", context);
    } else if (message.command === "attachSelection") {
      await vscode.commands.executeCommand("forge.attachSelection");
    } else if (message.command === "attachFile") {
      await vscode.commands.executeCommand("forge.attachFile");
    } else if (message.command === "openSettings") {
      await this.openSettings();
    } else if (message.command === "newConversation") {
      this._rejectPendingPermissions();
      await destroySession(this._conversationId);
      this._conversationId = `conv-${crypto.randomUUID()}`;
      this._view?.webview.postMessage({ type: "conversationReset" });
    } else if (message.command === "chatFocused") {
      const editor = vscode.window.activeTextEditor;
      if (!editor) { return; }
      const selection = editor.selection;
      const content = editor.document.getText(selection);
      if (!content) { return; }
      const filePath = vscode.workspace.asRelativePath(editor.document.uri);
      const ctx: ContextItem = {
        type: "selection",
        filePath,
        languageId: editor.document.languageId,
        content,
        startLine: selection.start.line + 1,
        endLine: selection.end.line + 1,
      };
      this.postContextAttached(ctx);
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
    }
  }

  private async _handleChatMessage(prompt: string, context?: ContextItem[]): Promise<void> {
    if (this._isProcessing) { return; }

    let config: Awaited<ReturnType<typeof getConfigurationAsync>>;
    try {
      config = await getConfigurationAsync(this._secrets);
    } catch {
      this._postError("Failed to read API key from secure storage. Click the ⚙️ gear icon → 'Set API Key (secure)' to re-enter it.");
      return;
    }
    const validationErrors = validateConfiguration(config);

    if (validationErrors.length > 0) {
      for (const error of validationErrors) {
        this._postError(error.message);
      }
      return;
    }

    let session: ICopilotSession;
    try {
      session = await getOrCreateSession(
        this._conversationId,
        config,
        this._createPermissionHandler(),
      );
    } catch (err: unknown) {
      if (err instanceof CopilotCliNotFoundError) {
        this._postError(err.message);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this._postError(`Failed to start Copilot service: ${message}`);
      }
      return;
    }

    const enrichedPrompt = this._buildPromptWithContext(prompt, context);

    this._isProcessing = true;
    try {
      await this._streamResponse(enrichedPrompt, session);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = this._rewriteAuthError(raw);
      this._postError(message);
      await destroySession(this._conversationId);
    } finally {
      this._isProcessing = false;
    }
  }

  private static readonly _CONTEXT_CHAR_BUDGET = 8000;

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

    const budget = ChatViewProvider._CONTEXT_CHAR_BUDGET;
    const truncationNote = "\n...[truncated — context exceeds 8000 char limit]";
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

      if (usedChars + fullBlock.length <= budget) {
        blocks.push(fullBlock);
        usedChars += fullBlock.length;
      } else {
        // Truncate this item's content to fit within the remaining budget
        const shell = `${header}\n${fence}\n`;
        const tail = `\n${fenceClose}${truncationNote}`;
        const available = budget - usedChars - shell.length - tail.length;

        if (available > 0) {
          blocks.push(`${shell}${item.content.slice(0, available)}${tail}`);
        } else {
          // No room even for the shell — emit header + truncation note only
          blocks.push(`${header}${truncationNote}`);
        }
        break; // budget exhausted; drop remaining items
      }
    }

    return blocks.join("\n\n") + "\n\n" + prompt;
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
      const cleanup = () => {
        unsubDelta();
        unsubIdle();
        unsubError();
        unsubToolStart();
        unsubToolComplete();
      };

      const unsubDelta = session.on("assistant.message_delta", (event: MessageDeltaEvent) => {
        if (event?.data?.deltaContent) {
          this._view?.webview.postMessage({
            type: "streamDelta",
            content: event.data.deltaContent,
          });
        }
      });

      const unsubToolStart = session.on("tool.execution_start", (event: ToolExecutionStartEvent) => {
        if (event?.data?.toolCallId && event?.data?.toolName) {
          this._toolNames.set(event.data.toolCallId, event.data.toolName);
        }
      });

      const unsubToolComplete = session.on("tool.execution_complete", (event: ToolExecutionCompleteEvent) => {
        if (event?.data?.toolCallId) {
          const toolName = this._toolNames.get(event.data.toolCallId) ?? "unknown";
          this._toolNames.delete(event.data.toolCallId);
          this._view?.webview.postMessage({
            type: "toolResult",
            id: event.data.toolCallId,
            tool: toolName,
            status: event.data.success ? "success" : "error",
            output: event.data.success
              ? (event.data.result?.content ?? "")
              : (event.data.error?.message ?? "Tool execution failed"),
          });
        }
      });

      const unsubIdle = session.on("session.idle", () => {
        if (settled) { return; }
        settled = true;
        cleanup();
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

      // Auto-deny after a short timeout to avoid hanging indefinitely
      const timeoutMs = 120_000; // 2 minutes

      return new Promise<PermissionRequestResult>((resolve) => {
        const timeoutHandle = setTimeout(() => {
          // If still pending when the timeout fires, deny the request
          const resolver = this._pendingPermissions.get(toolCallId);
          if (resolver) {
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
    for (const [, resolver] of this._pendingPermissions) {
      resolver(false);
    }
    this._pendingPermissions.clear();
    this._toolNames.clear();
  }

  private _postError(message: string): void {
    this._view?.webview.postMessage({ type: "error", message });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "chat.css")
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "media", "chat.js")
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
            </div>
        </div>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
