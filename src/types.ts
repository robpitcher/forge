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
}

// ---------------------------------------------------------------------------
// Event payload types used by this extension
// ---------------------------------------------------------------------------

/** Payload for `assistant.message_delta` events. */
export interface MessageDeltaEvent {
  delta?: { content?: string };
}

/** Payload for `session.error` events. */
export interface SessionErrorEvent {
  error?: { message?: string };
}

// ---------------------------------------------------------------------------
// CopilotSession structural interface
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventCallback = (...args: any[]) => void;

/**
 * Structural interface for a Copilot SDK session.
 *
 * The SDK's runtime CopilotSession exposes EventEmitter-pattern helpers
 * (`sendMessage`, `off`, `once`, `removeListener`) that are not present in the
 * published type declarations.  This interface captures the contract that the
 * extension actually relies on.
 */
export interface ICopilotSession {
  sendMessage(message: { role: string; content: string }): Promise<unknown>;
  abort(): Promise<void>;

  on(
    event: "assistant.message_delta",
    handler: (event: MessageDeltaEvent) => void,
  ): void;
  on(event: string, handler: EventCallback): void;

  off?(event: string, handler: EventCallback): void;

  once(event: "session.idle", handler: () => void): void;
  once(
    event: "session.error",
    handler: (event: SessionErrorEvent) => void,
  ): void;
  once(event: string, handler: EventCallback): void;

  removeListener?(event: string, handler: EventCallback): void;
}
