import * as vscode from "vscode";
import * as crypto from "crypto";
import { getConfiguration, validateConfiguration } from "./configuration.js";
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
} from "./types.js";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ChatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("enclave.chatView", provider)
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

  constructor(private readonly _extensionUri: vscode.Uri) {}

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

  private async _handleMessage(message: { command: string; text?: string }): Promise<void> {
    if (message.command === "sendMessage") {
      await this._handleChatMessage(message.text ?? "");
    } else if (message.command === "newConversation") {
      await destroySession(this._conversationId);
      this._conversationId = `conv-${crypto.randomUUID()}`;
      this._view?.webview.postMessage({ type: "conversationReset" });
    }
  }

  private async _handleChatMessage(prompt: string): Promise<void> {
    if (this._isProcessing) { return; }

    const config = getConfiguration();
    const validationErrors = validateConfiguration(config);

    if (validationErrors.length > 0) {
      for (const error of validationErrors) {
        this._postError(error.message);
      }
      return;
    }

    let session: ICopilotSession;
    try {
      session = await getOrCreateSession(this._conversationId, config);
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
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
      await destroySession(this._conversationId);
    } finally {
      this._isProcessing = false;
    }
  }

  private _streamResponse(prompt: string, session: ICopilotSession): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._view?.webview.postMessage({ type: "streamStart" });

      let settled = false;
      const cleanup = () => {
        unsubDelta();
        unsubIdle();
        unsubError();
      };

      const unsubDelta = session.on("assistant.message_delta", (event: MessageDeltaEvent) => {
        if (event?.data?.deltaContent) {
          this._view?.webview.postMessage({
            type: "streamDelta",
            content: event.data.deltaContent,
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
    <title>Enclave Chat</title>
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
