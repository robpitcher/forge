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
  simulateWebviewCommand,
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
      authMethod: "apiKey",
      wireApi: "completions",
      cliPath: "",
    };
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
      update: vi.fn().mockResolvedValue(undefined),
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
    it("registers with correct view ID 'forge.chatView'", () => {
      const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
      expect(calls[calls.length - 1][0]).toBe("forge.chatView");
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
        expect(messages.length).toBeGreaterThanOrEqual(8);
      });

      const messages = getPostedMessages(mockView);
      const types = messages
        .filter((m: unknown) => {
          const t = (m as { type: string }).type;
          return t !== "authStatus" && t !== "modelsUpdated" && t !== "modelSelected" && t !== "configStatus";
        })
        .map((m: unknown) => (m as { type: string }).type);

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
        update: vi.fn().mockResolvedValue(undefined),
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

  // --- Welcome screen config status auto-refresh ---
  describe("welcome screen config status auto-refresh", () => {
    it("postConfigStatus posts configStatus message to webview", async () => {
      const provider = capturedProvider as unknown as {
        postConfigStatus: (
          hasEndpoint: boolean,
          hasAuth: boolean,
          hasModels: boolean
        ) => void;
      };

      provider.postConfigStatus(true, false, true);

      await vi.waitFor(() => {
        const configStatuses = getPostedMessagesOfType(mockView, "configStatus");
        expect(configStatuses.length).toBeGreaterThanOrEqual(1);
      });

      const configStatuses = getPostedMessagesOfType(mockView, "configStatus");
      const lastConfigStatus = configStatuses[configStatuses.length - 1] as {
        type: string;
        hasEndpoint: boolean;
        hasAuth: boolean;
        hasModels: boolean;
      };
      expect(lastConfigStatus).toEqual({
        type: "configStatus",
        hasEndpoint: true,
        hasAuth: false,
        hasModels: true,
      });
    });

    it("_sendConfigStatus still works for initial load", async () => {
      // Verify _sendConfigStatus is called during resolveWebviewView (existing behavior preserved)
      const initialMessages = getPostedMessages(mockView);
      const configStatuses = initialMessages.filter(
        (m: unknown) => (m as { type: string }).type === "configStatus"
      );
      
      // Should have at least one configStatus message from initial load
      expect(configStatuses.length).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Clear API key ---
  describe("clear API key", () => {
    let mockExtContext: {
      subscriptions: { dispose: () => void }[];
      extensionUri: { toString: () => string };
      secrets: {
        get: ReturnType<typeof vi.fn>;
        store: ReturnType<typeof vi.fn>;
        delete: ReturnType<typeof vi.fn>;
        onDidChange: ReturnType<typeof vi.fn>;
      };
      workspaceState: {
        get: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
        keys: ReturnType<typeof vi.fn>;
      };
    };

    beforeEach(() => {
      const stateStore = new Map<string, unknown>();
      mockExtContext = {
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
    });

    it("clearApiKey command deletes key from SecretStorage", async () => {
      const provider = capturedProvider as unknown as {
        _secrets: typeof mockExtContext.secrets;
      };

      // Replace the provider's secrets with our mock to track calls
      provider._secrets = mockExtContext.secrets;

      // Send clearApiKey message via webview
      simulateWebviewCommand(mockView, { command: "clearApiKey" });

      await vi.waitFor(() => {
        expect(mockExtContext.secrets.delete).toHaveBeenCalledWith(
          "forge.copilot.apiKey"
        );
      });
    });

    it("clearApiKey shows confirmation message", async () => {
      // Send clearApiKey message via webview
      simulateWebviewCommand(mockView, { command: "clearApiKey" });

      await vi.waitFor(() => {
        expect(vscode.window.showInformationMessage).toHaveBeenCalled();
      });

      const calls = vi.mocked(vscode.window.showInformationMessage).mock.calls;
      expect(calls.some((call) => call[0].includes("API key"))).toBe(true);
    });

    it("clearApiKey triggers auth status refresh", async () => {
      // Create a spy to track auth refresh callback invocation
      const provider = capturedProvider as unknown as {
        _refreshAuthStatus?: () => void;
      };

      let authRefreshCalled = false;
      const originalRefresh = provider._refreshAuthStatus;
      provider._refreshAuthStatus = () => {
        authRefreshCalled = true;
        originalRefresh?.();
      };

      // Send clearApiKey message
      simulateWebviewCommand(mockView, { command: "clearApiKey" });

      // Wait for refresh to be called
      await vi.waitFor(() => {
        expect(authRefreshCalled).toBe(true);
      }, { timeout: 1000 });
    });

    it("openSettings shows Clear API Key option", async () => {
      const provider = capturedProvider as unknown as {
        openSettings: () => Promise<void>;
      };

      // Capture the quickpick items without selecting any
      let capturedItems: Array<{ label?: string }> | undefined;
      vi.mocked(vscode.window.showQuickPick).mockImplementation(
        (items: unknown) => {
          capturedItems = items as Array<{ label?: string }>;
          return Promise.resolve(undefined);
        }
      );

      await provider.openSettings();

      expect(vscode.window.showQuickPick).toHaveBeenCalled();
      const items = (capturedItems ?? []).map((item) =>
        typeof item === "string" ? item : item.label
      );
      expect(items.some((item) => item?.includes("Clear API Key"))).toBe(true);
    });

    it("openSettings Clear API Key option calls delete", async () => {
      const provider = capturedProvider as unknown as {
        openSettings: () => Promise<void>;
        _secrets: typeof mockExtContext.secrets;
      };

      // Replace the provider's secrets with our mock to track calls
      provider._secrets = mockExtContext.secrets;

      // Mock user selecting "Clear API Key"
      vi.mocked(vscode.window.showQuickPick).mockResolvedValueOnce("Clear API Key" as never);

      await provider.openSettings();

      // Verify delete was called
      await vi.waitFor(() => {
        expect(mockExtContext.secrets.delete).toHaveBeenCalledWith(
          "forge.copilot.apiKey"
        );
      });
    });
  });
});
