import * as vscode from "vscode";
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
  private _conversationId: string = `conv-${Date.now()}`;

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
    webviewView.webview.onDidReceiveMessage(this._handleMessage.bind(this));
  }

  private async _handleMessage(message: { command: string; text?: string }): Promise<void> {
    if (message.command === "sendMessage") {
      await this._handleChatMessage(message.text ?? "");
    } else if (message.command === "newConversation") {
      await destroySession(this._conversationId);
      this._conversationId = `conv-${Date.now()}`;
      this._view?.webview.postMessage({ type: "conversationReset" });
    }
  }

  private async _handleChatMessage(prompt: string): Promise<void> {
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

    try {
      await this._streamResponse(prompt, session);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this._postError(message);
      await destroySession(this._conversationId);
    }
  }

  private _streamResponse(prompt: string, session: ICopilotSession): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this._view?.webview.postMessage({ type: "streamStart" });

      const messageDeltaHandler = (event: MessageDeltaEvent) => {
        if (event?.delta?.content) {
          this._view?.webview.postMessage({
            type: "streamDelta",
            content: event.delta.content,
          });
        }
      };

      session.on("assistant.message_delta", messageDeltaHandler);

      session.once("session.idle", () => {
        if (typeof session.off === "function") {
          session.off("assistant.message_delta", messageDeltaHandler);
        } else if (typeof session.removeListener === "function") {
          session.removeListener("assistant.message_delta", messageDeltaHandler);
        }
        this._view?.webview.postMessage({ type: "streamEnd" });
        resolve();
      });

      session.once("session.error", (event: SessionErrorEvent) => {
        if (typeof session.off === "function") {
          session.off("assistant.message_delta", messageDeltaHandler);
        } else if (typeof session.removeListener === "function") {
          session.removeListener("assistant.message_delta", messageDeltaHandler);
        }
        const message = event?.error?.message ?? "Unknown session error";
        reject(new Error(message));
      });

      session.sendMessage({ role: "user", content: prompt }).catch(reject);
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
    <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
