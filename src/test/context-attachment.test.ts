/**
 * Context Attachment Tests — Issue #26
 *
 * Tests the @workspace context feature: attaching selections and files
 * to chat messages so they're included in the prompt sent to the SDK.
 *
 * These tests exercise the implemented context attachment behavior,
 * including `_buildPromptWithContext`, using active `it(...)` tests
 * rather than `.todo()` placeholders.
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
  type MockWebviewView,
} from "./webview-test-helpers.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

vi.mock("../auth/authStatusProvider.js", () => ({
  checkAuthStatus: vi.fn().mockResolvedValue({ state: "authenticated", method: "apiKey" }),
}));

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

/** Sends a raw webview message (simulating the webview posting back). */
function simulateWebviewMessage(view: MockWebviewView, message: Record<string, unknown>) {
  for (const handler of view.webview._messageHandlers) {
    handler(message);
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Context attachment (#26)", () => {
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
  // 1. Context commands registered
  // =========================================================================
  it("registers forge.attachSelection and forge.attachFile commands", () => {
    const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
    const registered = calls.map((c) => c[0]);
    expect(registered).toContain("forge.attachSelection");
    expect(registered).toContain("forge.attachFile");
  });

  // =========================================================================
  // 2. Context included in prompt
  // =========================================================================
  it("includes context items in the prompt sent to session.send", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.idle");
    });

    simulateWebviewMessage(mockView, {
      command: "sendMessage",
      text: "explain this",
      context: [
        {
          type: "selection",
          filePath: "src/utils.ts",
          languageId: "typescript",
          content: "const x = 1;",
          startLine: 5,
          endLine: 5,
        },
      ],
    });

    await vi.waitFor(() => {
      expect(mockSession.send).toHaveBeenCalled();
    });

    const sendArgs = mockSession.send.mock.calls[0][0] as { prompt: string };
    expect(sendArgs.prompt).toContain("--- Context: src/utils.ts:5-5 (typescript) ---");
    expect(sendArgs.prompt).toContain("const x = 1;");
    expect(sendArgs.prompt).toMatch(/explain this$/);
  });

  // =========================================================================
  // 3. Message without context still works (regression)
  // =========================================================================
  it("sends plain text when no context is attached (regression)", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.idle");
    });

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      expect(mockSession.send).toHaveBeenCalled();
    });

    // Verify prompt is just "hello" — no context prefix injected.
    const sendArgs = mockSession.send.mock.calls[0][0] as { prompt: string };
    expect(sendArgs.prompt).toBe("hello");
  });

  // =========================================================================
  // 4. Multiple context items
  // =========================================================================
  it("includes multiple context items in the prompt", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.idle");
    });

    simulateWebviewMessage(mockView, {
      command: "sendMessage",
      text: "review",
      context: [
        {
          type: "selection",
          filePath: "src/a.ts",
          languageId: "typescript",
          content: "const a = 1;",
          startLine: 1,
          endLine: 1,
        },
        {
          type: "file",
          filePath: "src/b.ts",
          languageId: "typescript",
          content: "export function b() {}",
        },
      ],
    });

    await vi.waitFor(() => {
      expect(mockSession.send).toHaveBeenCalled();
    });

    const sendArgs = mockSession.send.mock.calls[0][0] as { prompt: string };
    expect(sendArgs.prompt).toContain("--- Context: src/a.ts:1-1 (typescript) ---");
    expect(sendArgs.prompt).toContain("--- Context: src/b.ts (typescript) ---");
    expect(sendArgs.prompt).toContain("const a = 1;");
    expect(sendArgs.prompt).toContain("export function b() {}");
    expect(sendArgs.prompt).toMatch(/review$/);
  });

  // =========================================================================
  // 5. Context truncation
  // =========================================================================
  it("truncates context items longer than 8000 characters", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.idle");
    });

    const longString = "x".repeat(10_000);
    simulateWebviewMessage(mockView, {
      command: "sendMessage",
      text: "explain",
      context: [
        {
          type: "selection",
          filePath: "big.ts",
          languageId: "typescript",
          content: longString,
          startLine: 1,
          endLine: 100,
        },
      ],
    });

    await vi.waitFor(() => {
      expect(mockSession.send).toHaveBeenCalled();
    });

    const sendArgs = mockSession.send.mock.calls[0][0] as { prompt: string };
    expect(sendArgs.prompt).toContain("[truncated");
    // Context portion (before user prompt) should not exceed ~8000 chars
    const contextPart = sendArgs.prompt.split("explain")[0];
    expect(contextPart.length).toBeLessThanOrEqual(8200); // some slack for headers
  });

  // =========================================================================
  // 6. Empty context array treated as no context
  // =========================================================================
  it("treats empty context array as no context", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.idle");
    });

    // Send message with explicit empty context array
    simulateWebviewMessage(mockView, {
      command: "sendMessage",
      text: "hello",
      context: [],
    });

    await vi.waitFor(() => {
      expect(mockSession.send).toHaveBeenCalled();
    });

    // Verify prompt is just "hello" — no context prefix injected.
    const sendArgs = mockSession.send.mock.calls[0][0] as { prompt: string };
    expect(sendArgs.prompt).toBe("hello");
  });

  // =========================================================================
  // 7. Streaming still works with context messages (regression)
  // =========================================================================
  it("streams response correctly for plain messages", async () => {
    mockSession.send.mockImplementation(async () => {
      mockSession._emit("assistant.message_delta", {
        data: { deltaContent: "world" },
      });
      mockSession._emit("session.idle");
    });

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const msgs = getPostedMessages(mockView);
      const types = msgs.map((m: unknown) => (m as { type: string }).type);
      expect(types).toContain("streamEnd");
    });

    const types = getPostedMessages(mockView)
      .filter((m: unknown) => {
        const t = (m as { type: string }).type;
        return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected";
      })
      .map((m: unknown) => (m as { type: string }).type);
    expect(types[0]).toBe("streamStart");
    expect(types).toContain("streamDelta");
    expect(types[types.length - 1]).toBe("streamEnd");
  });
});
