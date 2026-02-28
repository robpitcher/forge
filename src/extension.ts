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
} from "./types.js";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri, context.secrets);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("forge.chatView", provider),
    vscode.commands.registerCommand("forge.openSettings", () =>
      provider.openSettings()
    )
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
      await this._handleChatMessage((message.text as string) ?? "");
    } else if (message.command === "openSettings") {
      await this.openSettings();
    } else if (message.command === "newConversation") {
      this._rejectPendingPermissions();
      await destroySession(this._conversationId);
      this._conversationId = `conv-${crypto.randomUUID()}`;
      this._view?.webview.postMessage({ type: "conversationReset" });
    } else if (message.command === "toolResponse") {
      const id = message.id as string;
      const approved = message.approved as boolean;
      const resolver = this._pendingPermissions.get(id);
      if (resolver) {
        this._pendingPermissions.delete(id);
        resolver(approved);
      }
    }
  }

  private async _handleChatMessage(prompt: string): Promise<void> {
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

    this._isProcessing = true;
    try {
      await this._streamResponse(prompt, session);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      const message = this._rewriteAuthError(raw);
      this._postError(message);
      await destroySession(this._conversationId);
    } finally {
      this._isProcessing = false;
    }
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
