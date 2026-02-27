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
} from "@github/copilot-sdk";

// Re-export the SDK's CopilotClient class type — it already covers start/stop/createSession.
export type CopilotClient = SDKCopilotClient;

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
