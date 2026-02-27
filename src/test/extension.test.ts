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
  simulateNewConversation,
  getPostedMessages,
  getPostedMessagesOfType,
  type MockWebviewView,
} from "./webview-test-helpers.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

describe("WebviewView chat panel", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let capturedProvider: {
    resolveWebviewView: (
      view: unknown,
      context: unknown,
      token: unknown
    ) => void;
  };
  let mockView: MockWebviewView;

  function setupValidConfig() {
    const settings: Record<string, string> = {
      endpoint: "https://myresource.openai.azure.com/openai/v1/",
      apiKey: "test-key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);
  }

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
    setupValidConfig();

    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
    };
    activate(mockExtContext as unknown as import("vscode").ExtensionContext);

    // Capture the provider registered with registerWebviewViewProvider
    const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
    capturedProvider = calls[calls.length - 1][1] as typeof capturedProvider;

    mockView = resolveProvider();
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
  });

  // --- Registration ---
  describe("provider registration", () => {
    it("registers with correct view ID 'enclave.chatView'", () => {
      const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
      expect(calls[calls.length - 1][0]).toBe("enclave.chatView");
    });
  });

  // --- resolveWebviewView ---
  describe("resolveWebviewView", () => {
    it("sets enableScripts to true", () => {
      expect(mockView.webview.options).toEqual(
        expect.objectContaining({ enableScripts: true })
      );
    });

    it("sets localResourceRoots", () => {
      expect(mockView.webview.options).toHaveProperty("localResourceRoots");
    });

    it("sets HTML with required elements", () => {
      const html = mockView.webview.html;
      expect(html).toContain("chatMessages");
      expect(html).toContain("userInput");
      expect(html).toContain("sendBtn");
      expect(html).toContain("newConvBtn");
    });
  });

  // --- Streaming message protocol ---
  describe("sendMessage command", () => {
    it("sends streamStart → streamDelta → streamEnd in order", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("assistant.message_delta", {
          data: { deltaContent: "Hello " },
        });
        mockSession._emit("assistant.message_delta", {
          data: { deltaContent: "there!" },
        });
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "hello");

      // Allow async handlers to complete
      await vi.waitFor(() => {
        const messages = getPostedMessages(mockView);
        expect(messages.length).toBeGreaterThanOrEqual(4);
      });

      const messages = getPostedMessages(mockView);
      const types = messages.map((m: unknown) => (m as { type: string }).type);

      expect(types[0]).toBe("streamStart");
      expect(types[types.length - 1]).toBe("streamEnd");

      const deltas = getPostedMessagesOfType(mockView, "streamDelta");
      expect(deltas).toContainEqual({ type: "streamDelta", content: "Hello " });
      expect(deltas).toContainEqual({ type: "streamDelta", content: "there!" });
    });

    it("creates a session and sends user prompt", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.idle");
      });

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        expect(mockSession.send).toHaveBeenCalled();
      });

      expect(mockSession.send).toHaveBeenCalledWith({
        prompt: "hello",
      });
    });
  });

  // --- New conversation ---
  describe("newConversation command", () => {
    it("posts conversationReset message", async () => {
      simulateNewConversation(mockView);

      await vi.waitFor(() => {
        const resets = getPostedMessagesOfType(mockView, "conversationReset");
        expect(resets.length).toBe(1);
      });
    });
  });

  // --- Configuration errors ---
  describe("configuration errors", () => {
    it("posts error messages when config is missing", async () => {
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((_key: string, defaultValue: unknown) => defaultValue),
      } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        const errors = getPostedMessagesOfType(mockView, "error");
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });

      const errors = getPostedMessagesOfType(mockView, "error");
      const messages = errors.map(
        (e: unknown) => (e as { message: string }).message
      );
      expect(messages.some((m: string) => m.includes("endpoint"))).toBe(true);
    });
  });

  // --- CopilotCliNotFoundError ---
  describe("CopilotCliNotFoundError", () => {
    it("posts error message when CLI is not found", async () => {
      mockClient.start.mockRejectedValueOnce(
        new Error("spawn copilot ENOENT")
      );

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        const errors = getPostedMessagesOfType(mockView, "error");
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });

      const errors = getPostedMessagesOfType(mockView, "error");
      const messages = errors.map(
        (e: unknown) => (e as { message: string }).message
      );
      expect(messages.some((m: string) => m.includes("Copilot CLI not found"))).toBe(
        true
      );
    });
  });

  // --- Session errors ---
  describe("session error events", () => {
    it("posts error message and removes session on session.error", async () => {
      mockSession.send.mockImplementation(async () => {
        mockSession._emit("session.error", {
          data: { message: "Connection reset by peer" },
        });
      });

      simulateUserMessage(mockView, "hello");

      await vi.waitFor(() => {
        const errors = getPostedMessagesOfType(mockView, "error");
        expect(errors.length).toBeGreaterThanOrEqual(1);
      });

      const errors = getPostedMessagesOfType(mockView, "error");
      const messages = errors.map(
        (e: unknown) => (e as { message: string }).message
      );
      expect(
        messages.some((m: string) => m.includes("Connection reset by peer"))
      ).toBe(true);
    });
  });
});
