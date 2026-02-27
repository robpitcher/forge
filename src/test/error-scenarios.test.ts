import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import {
  createMockSession,
  createMockClient,
  setMockClient,
  type MockClient,
} from "./__mocks__/copilot-sdk.js";
import {
  getOrCreateClient,
  stopClient,
  CopilotCliNotFoundError,
} from "../copilotService.js";
import { activate } from "../extension.js";
import type { ExtensionConfig } from "../configuration.js";
import {
  createMockWebviewView,
  createMockResolveContext,
  createMockCancellationToken,
  simulateUserMessage,
  getPostedMessagesOfType,
  type MockWebviewView,
} from "./webview-test-helpers.js";

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

const validConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-key-123",
  model: "gpt-4.1",
  wireApi: "completions",
  cliPath: "",
};

// ---------------------------------------------------------------------------
// 1. Missing config — validateConfiguration returns errors
// ---------------------------------------------------------------------------

describe("Error: missing configuration", () => {
  it("returns two errors when both endpoint and apiKey are empty", async () => {
    const { validateConfiguration } = await import("../configuration.js");
    const errors = validateConfiguration({
      ...validConfig,
      endpoint: "",
      apiKey: "",
    });
    expect(errors).toHaveLength(2);
    expect(errors[0].field).toBe("enclave.copilot.endpoint");
    expect(errors[1].field).toBe("enclave.copilot.apiKey");
  });
});

// ---------------------------------------------------------------------------
// 2. CopilotCliNotFoundError — ENOENT / "not found" / "cannot find"
// ---------------------------------------------------------------------------

describe("Error: CopilotCliNotFoundError", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
  });

  it.each([
    ["ENOENT", "spawn copilot ENOENT"],
    ["not found", "copilot: command not found"],
    ["cannot find", "cannot find module copilot"],
  ])(
    "throws CopilotCliNotFoundError when start() fails with %s",
    async (_label, errorMessage) => {
      mockClient.start.mockRejectedValueOnce(new Error(errorMessage));

      await expect(getOrCreateClient(validConfig)).rejects.toThrow(
        CopilotCliNotFoundError
      );
    }
  );
});

// ---------------------------------------------------------------------------
// 3-7. WebviewView error paths — postMessage assertions
// ---------------------------------------------------------------------------

describe("Error: WebviewView error paths", () => {
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

  function setupProvider(settings: Record<string, string>) {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
      secrets: {
        get: vi.fn().mockResolvedValue(undefined),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
    };
    activate(mockExtContext as unknown as import("vscode").ExtensionContext);

    const calls = vi.mocked(vscode.window.registerWebviewViewProvider).mock.calls;
    capturedProvider = calls[calls.length - 1][1] as typeof capturedProvider;

    mockView = createMockWebviewView();
    capturedProvider.resolveWebviewView(
      mockView,
      createMockResolveContext(),
      createMockCancellationToken()
    );
  }

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
  });

  // Missing endpoint → error message posted to webview
  it("posts error when endpoint is missing", async () => {
    setupProvider({
      endpoint: "",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
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
    expect(messages.some((m: string) => m.includes("endpoint"))).toBe(true);
  });

  // Missing API key → error message posted to webview
  it("posts error when API key is missing", async () => {
    setupProvider({
      endpoint: "https://example.com",
      apiKey: "",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
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
    expect(messages.some((m: string) => m.includes("API key"))).toBe(true);
  });

  // CLI not found → CopilotCliNotFoundError message posted
  it("posts CLI-not-found error to webview", async () => {
    setupProvider({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockClient.start.mockRejectedValueOnce(new Error("spawn copilot ENOENT"));

    simulateUserMessage(mockView, "hi");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map(
      (e: unknown) => (e as { message: string }).message
    );
    expect(
      messages.some((m: string) => m.includes("Copilot CLI not found"))
    ).toBe(true);
  });

  // General startup error
  it("posts general startup error to webview", async () => {
    setupProvider({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockClient.start.mockRejectedValueOnce(new Error("Permission denied"));

    simulateUserMessage(mockView, "hi");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map(
      (e: unknown) => (e as { message: string }).message
    );
    expect(
      messages.some((m: string) => m.includes("Failed to start Copilot service"))
    ).toBe(true);
    expect(
      messages.some((m: string) => m.includes("Permission denied"))
    ).toBe(true);
  });

  // Network error during streaming → error posted, session removed
  it("posts error and removes session on sendMessage rejection", async () => {
    setupProvider({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockSession.send.mockRejectedValueOnce(
      new Error("Network timeout")
    );

    simulateUserMessage(mockView, "hi");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map(
      (e: unknown) => (e as { message: string }).message
    );
    expect(messages.some((m: string) => m.includes("Network timeout"))).toBe(
      true
    );

    // Verify session was removed: next request should create a new session
    const newSession = createMockSession();
    newSession.send.mockImplementation(async () => {
      newSession._emit("session.idle");
    });
    mockClient.createSession.mockResolvedValueOnce(newSession);

    simulateUserMessage(mockView, "retry");

    await vi.waitFor(() => {
      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });

  // Session error event → error posted, session removed
  it("posts error and removes session on session.error event", async () => {
    setupProvider({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockSession.send.mockImplementation(async () => {
      mockSession._emit("session.error", {
        data: { message: "Connection reset by peer" },
      });
    });

    simulateUserMessage(mockView, "hi");

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

    // Verify session was removed: next request should create a new session
    const newSession = createMockSession();
    newSession.send.mockImplementation(async () => {
      newSession._emit("session.idle");
    });
    mockClient.createSession.mockResolvedValueOnce(newSession);

    simulateUserMessage(mockView, "retry");

    await vi.waitFor(() => {
      expect(mockClient.createSession).toHaveBeenCalledTimes(2);
    });
  });
});
