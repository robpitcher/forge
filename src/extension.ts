import * as vscode from "vscode";
import { getConfiguration, validateConfiguration } from "./configuration.js";
import {
  getOrCreateSession,
  removeSession,
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
  const participant = vscode.chat.createChatParticipant(
    "enclave.copilot",
    handleChatRequest
  );
  participant.iconPath = new vscode.ThemeIcon("hubot");

  context.subscriptions.push(participant);
}

export async function deactivate(): Promise<void> {
  // stopClient now calls destroyAllSessions internally before stopping the client
  await stopClient();
}

async function handleChatRequest(
  request: vscode.ChatRequest,
  context: vscode.ChatContext,
  stream: vscode.ChatResponseStream,
  token: vscode.CancellationToken
): Promise<void> {
  const config = getConfiguration();
  const validationErrors = validateConfiguration(config);

  if (validationErrors.length > 0) {
    for (const error of validationErrors) {
      stream.markdown(`⚠️ ${error.message}\n\n`);
    }
    stream.button({
      command: "workbench.action.openSettings",
      arguments: ["enclave.copilot"],
      title: "Open Settings",
    });
    return;
  }

  const conversationId = getConversationId(context);

  let session: ICopilotSession;
  try {
    session = await getOrCreateSession(conversationId, config);
  } catch (err: unknown) {
    if (err instanceof CopilotCliNotFoundError) {
      stream.markdown(`⚠️ ${err.message}`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      stream.markdown(`❌ Failed to start Copilot service: ${message}`);
    }
    return;
  }

  const abortListener = token.onCancellationRequested(() => {
    try {
      session.abort();
    } catch {
      // ignore abort errors
    }
  });

  try {
    await sendMessage(request.prompt, session, stream);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    stream.markdown(`❌ Error: ${message}`);
    await destroySession(conversationId);
  } finally {
    abortListener.dispose();
  }
}

function getConversationId(context: vscode.ChatContext): string {
  const ctxWithId = context as unknown as { id?: unknown };
  if (typeof ctxWithId.id === "string" && ctxWithId.id.length > 0) {
    return ctxWithId.id;
  }
  return `conversation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sendMessage(
  prompt: string,
  session: ICopilotSession,
  stream: vscode.ChatResponseStream
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const messageDeltaHandler = (event: MessageDeltaEvent) => {
      if (event?.delta?.content) {
        stream.markdown(event.delta.content);
      }
    };

    session.on("assistant.message_delta", messageDeltaHandler);

    session.once("session.idle", () => {
      if (typeof session.off === "function") {
        session.off("assistant.message_delta", messageDeltaHandler);
      } else if (typeof session.removeListener === "function") {
        session.removeListener("assistant.message_delta", messageDeltaHandler);
      }
      resolve();
    });

    session.once(
      "session.error",
      (event: SessionErrorEvent) => {
        if (typeof session.off === "function") {
          session.off("assistant.message_delta", messageDeltaHandler);
        } else if (typeof session.removeListener === "function") {
          session.removeListener(
            "assistant.message_delta",
            messageDeltaHandler
          );
        }
        const message = event?.error?.message ?? "Unknown session error";
        reject(new Error(message));
      }
    );

    session.sendMessage({ role: "user", content: prompt }).catch(reject);
  });
}
