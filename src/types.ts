/**
 * Type definitions for the Copilot SDK interfaces used by this extension.
 *
 * SessionConfig and related event types are re-exported directly from the SDK.
 * ProviderConfig is defined locally based on the shape of SessionConfig.provider.
 * ICopilotSession is a structural interface because the SDK class type does
 * not surface the EventEmitter-style methods available at runtime.
 */

import type { CopilotClient as SDKCopilotClient } from "@github/copilot-sdk";

export type {
  SessionConfig,
  SessionEventType,
  SessionEventPayload,
  PermissionHandler,
  PermissionRequest,
  PermissionRequestResult,
  SessionMetadata,
  SessionListFilter,
  ResumeSessionConfig,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
} from "@github/copilot-sdk";

// Re-export the SDK's CopilotClient class type — it already covers start/stop/createSession.
export type CopilotClient = SDKCopilotClient;

// ---------------------------------------------------------------------------
// MCP server configuration (#90)
// ---------------------------------------------------------------------------

/** Configuration for a local MCP server. */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Configuration for a remote (HTTP/SSE) MCP server. */
export interface RemoteMcpServerConfig {
  url: string;
  headers?: Record<string, string>;
  command?: never;
  args?: never;
  env?: never;
}

/** Union of local and remote MCP server configurations. */
export type AnyMcpServerConfig = McpServerConfig | RemoteMcpServerConfig;

// ---------------------------------------------------------------------------
// ProviderConfig — not re-exported by the SDK's public API, so defined here
// based on the shape in SessionConfig.provider.
// ---------------------------------------------------------------------------

/** Configuration for a custom API provider (BYOK). */
export interface ProviderConfig {
  type?: "openai" | "azure" | "anthropic";
  wireApi?: "completions" | "responses";
  baseUrl: string;
  apiKey?: string;
  /**
   * Static bearer token for Entra ID / DefaultAzureCredential auth (#27).
   * The Copilot SDK does not support Entra ID natively — its `bearerToken`
   * field accepts a static string with no refresh callback. We obtain a
   * token via `DefaultAzureCredential.getToken()` before session creation.
   *
   * // TODO(#27): Revisit if the SDK adds native Entra / managed-identity support.
   */
  bearerToken?: string;
  azure?: {
    apiVersion?: string;
  };
}

// ---------------------------------------------------------------------------
// Event payload types used by this extension
// ---------------------------------------------------------------------------

/** Payload for `assistant.message_delta` events. */
export interface MessageDeltaEvent {
  type: "assistant.message_delta";
  data: { deltaContent: string; messageId?: string };
}

/** Payload for `session.error` events. */
export interface SessionErrorEvent {
  type: "session.error";
  data: { message: string; stack?: string };
}

/** Payload for `tool.execution_start` events. */
export interface ToolExecutionStartEvent {
  type: "tool.execution_start";
  data: {
    toolCallId: string;
    toolName: string;
    arguments?: unknown;
    mcpServerName?: string;
    mcpToolName?: string;
    parentToolCallId?: string;
  };
}

/** Payload for `tool.execution_complete` events. */
export interface ToolExecutionCompleteEvent {
  type: "tool.execution_complete";
  data: {
    toolCallId: string;
    success: boolean;
    isUserRequested?: boolean;
    result?: { content: string; detailedContent?: string };
    error?: { message: string; code?: string };
    parentToolCallId?: string;
  };
}

/** Payload for `tool.execution_progress` events. */
export interface ToolExecutionProgressEvent {
  type: "tool.execution_progress";
  data: {
    toolCallId: string;
    progressMessage: string;
  };
}

/** Payload for `tool.execution_partial_result` events. */
export interface ToolExecutionPartialResultEvent {
  type: "tool.execution_partial_result";
  data: {
    toolCallId: string;
    partialOutput: string;
  };
}

// ---------------------------------------------------------------------------
// Context items attached to prompts (workspace context)
// ---------------------------------------------------------------------------

/** A piece of workspace context (file or selection) to prepend to a prompt. */
export interface ContextItem {
  type: "selection" | "file";
  filePath: string;
  languageId: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

// ---------------------------------------------------------------------------
// Conversation metadata for the UI
// ---------------------------------------------------------------------------

/** Conversation metadata for UI display (simplified from SessionMetadata). */
export interface ConversationMetadata {
  sessionId: string;
  summary?: string;
  startTime: Date;
  modifiedTime: Date;
}

// ---------------------------------------------------------------------------
// CopilotSession structural interface
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

/** Function returned by session.on() to unsubscribe the handler. */
export type Unsubscribe = () => void;

/**
 * Structural interface for a Copilot SDK session.
 *
 * The SDK's CopilotSession uses a custom event system — not EventEmitter.
 * `on()` returns an unsubscribe function; there is no `once()` or `off()`.
 * Messages are sent via `send({ prompt })`, not `sendMessage()`.
 */
export interface ICopilotSession {
  send(options: { prompt: string }): Promise<string>;
  abort(): Promise<void>;

  on(
    event: "assistant.message_delta",
    handler: (event: MessageDeltaEvent) => void,
  ): Unsubscribe;
  on(
    event: "session.idle",
    handler: (event: { type: "session.idle" }) => void,
  ): Unsubscribe;
  on(
    event: "session.error",
    handler: (event: SessionErrorEvent) => void,
  ): Unsubscribe;
  on(event: string, handler: EventCallback): Unsubscribe;
}


