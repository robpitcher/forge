/**
 * Tool Approval Flow Tests — Issue #25
 *
 * Tests the built-in tool enablement and permission approval flow.
 * Written BEFORE implementation lands. Tests that depend on unimplemented
 * code use `.todo()` so they can be enabled incrementally.
 *
 * Expected flow:
 *   1. Session created WITHOUT `availableTools: []` (tools enabled)
 *   2. SDK emits permission request → extension forwards to webview as `toolConfirmation`
 *   3. User approves/denies in webview → extension calls SDK confirmation API
 *   4. `autoApproveTools` config bypasses the webview prompt
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import { stopClient } from "../copilotService.js";
import { activate } from "../extension.js";
import {
  createMockWebviewView,
  createMockResolveContext,
  createMockCancellationToken,
  simulateUserMessage,
  getPostedMessages,
  getPostedMessagesOfType,
  type MockWebviewView,
} from "./webview-test-helpers.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

vi.mock("../auth/authStatusProvider.js", () => ({
  checkAuthStatus: vi.fn().mockResolvedValue({ state: "authenticated", method: "apiKey" }),
}));

vi.mock("../copilotService.js", async () => {
  const actual = await vi.importActual<typeof import("../copilotService.js")>("../copilotService.js");
  return {
    ...actual,
    discoverAndValidateCli: vi.fn().mockResolvedValue({ valid: true, version: "0.1.0", path: "/usr/bin/copilot" }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupConfig(overrides: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = {
    endpoint: "https://myresource.openai.azure.com/openai/v1/",
    apiKey: "test-key-123",
    authMethod: "apiKey",
    models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    wireApi: "completions",
    cliPath: "",
    autoApproveTools: false,
    ...overrides,
  };
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
    get: vi.fn(
      (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
    ),
  } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
}

/** Sends a webview message (simulating the webview posting back). */
function simulateWebviewMessage(view: MockWebviewView, message: Record<string, unknown>) {
  for (const handler of view.webview._messageHandlers) {
    handler(message);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Tool approval flow (#25)", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let capturedProvider: {
    resolveWebviewView: (view: unknown, context: unknown, token: unknown) => void;
  };
  let mockView: MockWebviewView;

  function resolveProvider(): MockWebviewView {
    const view = createMockWebviewView();
    capturedProvider.resolveWebviewView(
      view,
      createMockResolveContext(),
      createMockCancellationToken()
    );
    return view;
  }

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    setupConfig();

    const stateStore = new Map<string, unknown>();
    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
      globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
      secrets: {
        get: vi.fn().mockImplementation((key: string) =>
          key === "forge.copilot.apiKey" ? Promise.resolve("test-key-123") : Promise.resolve(undefined)
        ),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
      workspaceState: {
        get: vi.fn((key: string, defaultValue?: unknown) => stateStore.get(key) ?? defaultValue),
        update: vi.fn((key: string, value: unknown) => { stateStore.set(key, value); return Promise.resolve(); }),
        keys: vi.fn(() => [...stateStore.keys()]),
      },
    };
    activate(mockExtContext as unknown as import("vscode").ExtensionContext);

    const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
    capturedProvider = calls[calls.length - 1][1] as typeof capturedProvider;
    mockView = resolveProvider();
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
  });

  // =========================================================================
  // 1. Tools are enabled (availableTools restriction removed)
  // =========================================================================
  describe("tools enabled in session config", () => {
    // BLOCKED: Childs is removing `availableTools: []` from copilotService.ts.
    // Enable this test once that change lands.
    it.todo(
      "does not pass availableTools:[] when creating a session"
      // Expected: createSession is called WITHOUT `availableTools: []`,
      // allowing the SDK to use its full built-in tool set.
      // Verify: sessionArgs.availableTools is either undefined or non-empty.
    );

    it("createSession is called with expected config shape", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalled();
      });

      const sessionArgs = mockClient.createSession.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      expect(sessionArgs).toBeDefined();
      expect(sessionArgs).toHaveProperty("model");
      expect(sessionArgs).toHaveProperty("provider");
      expect(sessionArgs).toHaveProperty("streaming", true);
    });
  });

  // =========================================================================
  // 2. Tool event handling — permission requests
  // =========================================================================
  describe("tool permission request handling", () => {
    it("permission handler posts toolConfirmation to webview when autoApproveTools is false", async () => {
      // 1. Don't immediately emit session.idle — keep session alive
      mockSession.send.mockImplementation(async () => {});

      // 2. Trigger session creation
      simulateUserMessage(mockView, "hello");

      // 3. Wait for createSession to be called
      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalled();
      }, { timeout: 10000 });

      // 4. Extract the handler
      const sessionArgs = mockClient.createSession.mock.calls[0]?.[0] as Record<string, unknown>;
      const handler = sessionArgs.onPermissionRequest as (request: unknown, invocation: unknown) => Promise<unknown>;
      expect(handler).toBeDefined();

      // 5. Note how many messages were posted before we invoke the handler
      const beforeCount = getPostedMessages(mockView).length;

      // 6. Invoke handler — DO NOT await yet! It returns a pending promise.
      const resultPromise = handler(
        { kind: "shell", toolCallId: "tc-1" },
        { sessionId: "s1" }
      );

      // 7. Give a tiny delay for any synchronous postMessage calls to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      // 8. Check if toolConfirmation was posted
      const msgs = getPostedMessages(mockView);
      const newMsgs = msgs.slice(beforeCount);
      const confirmations = newMsgs.filter((m: unknown) => (m as { type: string }).type === "toolConfirmation");
      
      expect(confirmations).toHaveLength(1);
      expect(confirmations[0]).toMatchObject({
        type: "toolConfirmation",
        id: "tc-1",
        tool: "shell",
      });

      // 9. Simulate webview responding with approval
      await new Promise(resolve => setTimeout(() => {
        simulateWebviewMessage(mockView, { command: "toolResponse", id: "tc-1", approved: true });
        resolve(undefined);
      }, 0));

      // 10. NOW await the result
      const result = await resultPromise;
      expect(result).toEqual({ kind: "approved" });
    }, 15000);

    it("auto-approves tool when autoApproveTools is true (no webview message)", async () => {
      // Setup with autoApproveTools enabled
      setupConfig({ autoApproveTools: true });

      // Re-activate with new config
      const stateStore2 = new Map<string, unknown>();
      const mockExtContext = {
        subscriptions: [] as { dispose: () => void }[],
        extensionUri: { toString: () => "mock-ext-uri" },
      globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
        secrets: {
          get: vi.fn().mockImplementation((key: string) =>
            key === "forge.copilot.apiKey" ? Promise.resolve("test-key-123") : Promise.resolve(undefined)
          ),
          store: vi.fn().mockResolvedValue(undefined),
          delete: vi.fn().mockResolvedValue(undefined),
          onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
        },
        workspaceState: {
          get: vi.fn((key: string, defaultValue?: unknown) => stateStore2.get(key) ?? defaultValue),
          update: vi.fn((key: string, value: unknown) => { stateStore2.set(key, value); return Promise.resolve(); }),
          keys: vi.fn(() => [...stateStore2.keys()]),
        },
      };
      activate(mockExtContext as unknown as import("vscode").ExtensionContext);

      const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
      capturedProvider = calls[calls.length - 1][1] as typeof capturedProvider;
      mockView = resolveProvider();

      mockSession.send.mockImplementation(async () => {
        // Don't emit session.idle — let the test control the flow
      });

      // Trigger session creation
      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalled();
      });

      // Extract the permission handler
      const sessionArgs = mockClient.createSession.mock.calls[0]?.[0] as Record<string, unknown>;
      expect(sessionArgs.onPermissionRequest).toBeDefined();
      const handler = sessionArgs.onPermissionRequest as (request: unknown, invocation: unknown) => Promise<unknown>;

      // Clear any messages posted during setup
      const initialMessageCount = getPostedMessages(mockView).length;

      // Trigger permission request
      const result = await handler(
        { kind: "shell", toolCallId: "tc-2" },
        { sessionId: "s1" }
      );

      // Verify NO new toolConfirmation was posted
      const finalMessages = getPostedMessages(mockView);
      const newMessages = finalMessages.slice(initialMessageCount);
      const confirmations = newMessages.filter((m: unknown) => (m as { type: string }).type === "toolConfirmation");
      expect(confirmations).toHaveLength(0);

      // Verify handler immediately returned approved
      expect(result).toEqual({ kind: "approved" });
    });
  });

  // =========================================================================
  // 3. Tool response handling — user approves/denies in webview
  // =========================================================================
  describe("tool response from webview", () => {
    it("resolves with approved when webview sends toolResponse approved=true", async () => {
      // 1. Keep session alive
      mockSession.send.mockImplementation(async () => {});

      // 2. Trigger session creation
      simulateUserMessage(mockView, "hello");

      // 3. Wait for createSession to be called
      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalled();
      }, { timeout: 10000 });

      // 4. Extract the handler
      const sessionArgs = mockClient.createSession.mock.calls[0]?.[0] as Record<string, unknown>;
      const handler = sessionArgs.onPermissionRequest as (request: unknown, invocation: unknown) => Promise<unknown>;

      // 5. Invoke handler without awaiting
      const resultPromise = handler(
        { kind: "shell", toolCallId: "tc-2" },
        { sessionId: "s1" }
      );

      // 6. Give tiny delay for postMessage
      await new Promise(resolve => setTimeout(resolve, 10));

      // 7. Simulate webview responding with approval
      simulateWebviewMessage(mockView, { command: "toolResponse", id: "tc-2", approved: true });

      // 8. Await the result
      const result = await resultPromise;
      expect(result).toEqual({ kind: "approved" });
    }, 15000);

    it("resolves with denied-interactively-by-user when webview sends toolResponse approved=false", async () => {
      // 1. Keep session alive
      mockSession.send.mockImplementation(async () => {});

      // 2. Trigger session creation
      simulateUserMessage(mockView, "hello");

      // 3. Wait for createSession to be called
      await vi.waitFor(() => {
        expect(mockClient.createSession).toHaveBeenCalled();
      }, { timeout: 10000 });

      // 4. Extract the handler
      const sessionArgs = mockClient.createSession.mock.calls[0]?.[0] as Record<string, unknown>;
      const handler = sessionArgs.onPermissionRequest as (request: unknown, invocation: unknown) => Promise<unknown>;

      // 5. Invoke handler without awaiting
      const resultPromise = handler(
        { kind: "bash", toolCallId: "tc-3" },
        { sessionId: "s1" }
      );

      // 6. Give tiny delay for postMessage
      await new Promise(resolve => setTimeout(resolve, 10));

      // 7. Simulate webview responding with denial
      simulateWebviewMessage(mockView, { command: "toolResponse", id: "tc-3", approved: false });

      // 8. Await the result
      const result = await resultPromise;
      expect(result).toEqual({ kind: "denied-interactively-by-user" });
    }, 15000);
  });

  // =========================================================================
  // 4. Edge cases
  // =========================================================================
  describe("edge cases", () => {
    it.todo(
      "handles toolResponse for unknown/expired tool call ID gracefully"
      // Expected: webview posts { command: "toolResponse", toolCallId: "unknown-id",
      // approved: true } → extension does not throw, logs a warning or no-ops.
    );

    it.todo(
      "tracks multiple concurrent tool calls independently"
      // Expected: two permission requests (tc-1, tc-2) arrive before user responds.
      // User approves tc-1 and denies tc-2. Each resolves independently with
      // the correct result. No cross-contamination.
    );

    it("existing text-only chat flow still works (regression)", async () => {
      // This test verifies the basic streaming flow is unbroken by tool changes.
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", {
          data: { deltaContent: "response text" },
        });
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        const messages = getPostedMessages(mockView)
          .filter((m: unknown) => {
            const t = (m as { type: string }).type;
            return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus";
          });
        expect(messages.length).toBeGreaterThanOrEqual(3);
      });

      const types = getPostedMessages(mockView)
        .filter((m: unknown) => {
          const t = (m as { type: string }).type;
          return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus" && t !== "cliStatus";
        })
        .map((m: unknown) => (m as { type: string }).type);
      expect(types[0]).toBe("streamStart");
      expect(types).toContain("streamDelta");
      expect(types[types.length - 1]).toBe("streamEnd");

      const deltas = getPostedMessagesOfType(mockView, "streamDelta");
      expect(deltas).toContainEqual({
        type: "streamDelta",
        content: "response text",
      });
    });
  });

  // =========================================================================
  // 6. Configuration
  // =========================================================================
  describe("autoApproveTools configuration", () => {
    it("defaults autoApproveTools to false", () => {
      // Read config with no overrides — should default to false
      const config = vscode.workspace.getConfiguration("forge.copilot");
      const value = config.get("autoApproveTools", false);
      expect(value).toBe(false);
    });

    it("reads autoApproveTools from VS Code configuration", () => {
      setupConfig({ autoApproveTools: true });
      const config = vscode.workspace.getConfiguration("forge.copilot");
      const value = config.get("autoApproveTools", false);
      expect(value).toBe(true);
    });
  });
});
