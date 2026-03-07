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
  getOrCreateSession,
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

vi.mock("@azure/identity", () => ({
  DefaultAzureCredential: class MockDefaultAzureCredential {
    getToken = vi.fn().mockResolvedValue({ token: "mock-entra-token", expiresOnTimestamp: Date.now() + 3600000 });
  },
}));

vi.mock("../auth/authStatusProvider.js", () => ({
  checkAuthStatus: vi.fn().mockResolvedValue({ state: "authenticated", method: "apiKey" }),
}));

vi.mock("../auth/credentialProvider.js", () => ({
  createCredentialProvider: vi.fn().mockResolvedValue({
    getToken: vi.fn().mockResolvedValue("mock-token"),
  }),
}));

vi.mock("../copilotService.js", async () => {
  const actual = await vi.importActual<typeof import("../copilotService.js")>("../copilotService.js");
  return {
    ...actual,
    getOrCreateSession: vi.fn(),
    discoverAndValidateCli: vi.fn().mockResolvedValue({ valid: true, version: "0.1.0", path: "/usr/bin/copilot" }),
  };
});

const validConfig: ExtensionConfig = {
  endpoint: "https://myresource.openai.azure.com/openai/v1/",
  apiKey: "test-key-123",
  authMethod: "apiKey",
  models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  wireApi: "completions",
  cliPath: "",
  toolShell: true,
  toolRead: true,
  toolWrite: true,
  toolUrl: false,
  toolMcp: true,
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
    expect(errors[0].field).toBe("forge.copilot.endpoint");
    expect(errors[1].field).toBe("forge.copilot.apiKey");
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

  function setupProvider(settings: Record<string, unknown>, secretApiKey?: string) {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
      globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
      secrets: {
        get: vi.fn().mockImplementation((key: string) =>
          key === "forge.copilot.apiKey" ? Promise.resolve(secretApiKey) : Promise.resolve(undefined)
        ),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
      workspaceState: {
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        keys: vi.fn().mockReturnValue([]),
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
    vi.mocked(getOrCreateSession).mockResolvedValue(mockSession as never);
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
  });

  // Missing endpoint → error message posted to webview
  it("posts error when endpoint is missing", async () => {
    setupProvider({
      endpoint: "",
      authMethod: "apiKey",
      apiKey: "",
      wireApi: "completions",
      cliPath: "",
    }, "key-123");

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
      authMethod: "apiKey",
      apiKey: "",
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
      authMethod: "apiKey",
      apiKey: "",
      wireApi: "completions",
      cliPath: "",
      models: ["gpt-4"],
    }, "key-123");

    vi.mocked(getOrCreateSession).mockRejectedValueOnce(
      new CopilotCliNotFoundError("Copilot CLI not found at configured path")
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
    expect(
      messages.some((m: string) => m.includes("Copilot CLI not found"))
    ).toBe(true);
  });

  // General startup error
  it("posts general startup error to webview", async () => {
    setupProvider({
      endpoint: "https://example.com",
      authMethod: "apiKey",
      apiKey: "",
      wireApi: "completions",
      cliPath: "",
      models: ["gpt-4"],
    }, "key-123");

    vi.mocked(getOrCreateSession).mockRejectedValueOnce(new Error("Permission denied"));

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
      authMethod: "apiKey",
      apiKey: "",
      wireApi: "completions",
      cliPath: "",
      models: ["gpt-4"],
    }, "key-123");

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
    vi.mocked(getOrCreateSession).mockClear();
    vi.mocked(getOrCreateSession).mockResolvedValueOnce(newSession as never);

    simulateUserMessage(mockView, "retry");

    await vi.waitFor(() => {
      expect(vi.mocked(getOrCreateSession)).toHaveBeenCalledTimes(1);
    });
  });

  // Session error event → error posted, session removed
  it("posts error and removes session on session.error event", async () => {
    setupProvider({
      endpoint: "https://example.com",
      authMethod: "apiKey",
      apiKey: "",
      wireApi: "completions",
      cliPath: "",
      models: ["gpt-4"],
    }, "key-123");

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
    vi.mocked(getOrCreateSession).mockClear();
    vi.mocked(getOrCreateSession).mockResolvedValueOnce(newSession as never);

    simulateUserMessage(mockView, "retry");

    await vi.waitFor(() => {
      expect(vi.mocked(getOrCreateSession)).toHaveBeenCalledTimes(1);
    });
  });
});

// ---------------------------------------------------------------------------
// M24 — _rewriteAuthError tests (private method tested via error message output)
// ---------------------------------------------------------------------------
describe("Error: auth error rewriting (_rewriteAuthError)", () => {
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

  function setupRewriteProvider(settings: Record<string, unknown>, secretApiKey?: string) {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    const mockExtContext = {
      subscriptions: [] as { dispose: () => void }[],
      extensionUri: { toString: () => "mock-ext-uri" },
      globalStorageUri: { fsPath: "/tmp/mock-global-storage" },
      secrets: {
        get: vi.fn().mockImplementation((key: string) =>
          key === "forge.copilot.apiKey" ? Promise.resolve(secretApiKey) : Promise.resolve(undefined)
        ),
        store: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
        onDidChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
      },
      workspaceState: {
        get: vi.fn().mockReturnValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        keys: vi.fn().mockReturnValue([]),
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

  const providerSettings = {
    endpoint: "https://example.com",
    authMethod: "apiKey",
    apiKey: "",
    wireApi: "completions",
    cliPath: "",
    models: ["gpt-4"],
  };

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
    vi.mocked(getOrCreateSession).mockResolvedValue(mockSession as never);
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.window.registerWebviewViewProvider).mockClear();
  });

  it("rewrites error containing '401' to mention settings", async () => {
    setupRewriteProvider(providerSettings, "key-123");
    mockSession.send.mockRejectedValueOnce(new Error("Request failed with status 401"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("API key is missing or invalid"))).toBe(true);
    expect(messages.some((m: string) => m.includes("gear icon"))).toBe(true);
  });

  it("rewrites error containing 'unauthorized' to mention settings", async () => {
    setupRewriteProvider(providerSettings, "key-123");
    mockSession.send.mockRejectedValueOnce(new Error("Unauthorized access to resource"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("API key is missing or invalid"))).toBe(true);
  });

  it("rewrites error containing 'authorization' to mention settings", async () => {
    setupRewriteProvider(providerSettings, "key-123");
    mockSession.send.mockRejectedValueOnce(new Error("Authorization header is missing"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("API key is missing or invalid"))).toBe(true);
  });

  it("does not rewrite errors without auth keywords", async () => {
    setupRewriteProvider(providerSettings, "key-123");
    mockSession.send.mockRejectedValueOnce(new Error("Network timeout after 30s"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Network timeout after 30s"))).toBe(true);
    expect(messages.some((m: string) => m.includes("API key is missing"))).toBe(false);
  });

  it("rewrites error containing '/login' to mention settings", async () => {
    setupRewriteProvider(providerSettings, "key-123");
    mockSession.send.mockRejectedValueOnce(new Error("Redirect to /login required"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("API key is missing or invalid"))).toBe(true);
  });

  // --- Entra ID auth method: should get RBAC-specific message, not API key message ---

  const entraIdSettings = {
    endpoint: "https://example.com",
    authMethod: "entraId",
    apiKey: "",
    wireApi: "completions",
    cliPath: "",
    models: ["gpt-4"],
  };

  it("rewrites 401 error to mention RBAC role when authMethod is entraId", async () => {
    setupRewriteProvider(entraIdSettings);
    mockSession.send.mockRejectedValueOnce(new Error("Request failed with status 401"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Entra ID authentication was rejected"))).toBe(true);
    expect(messages.some((m: string) => m.includes("(HTTP 401)"))).toBe(true);
    expect(messages.some((m: string) => m.includes("Cognitive Services OpenAI User"))).toBe(true);
    expect(messages.some((m: string) => m.includes("API key is missing"))).toBe(false);
  });

  it("rewrites 'unauthorized' error to mention RBAC role when authMethod is entraId", async () => {
    setupRewriteProvider(entraIdSettings);
    mockSession.send.mockRejectedValueOnce(new Error("Unauthorized access to resource"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Entra ID authentication was rejected"))).toBe(true);
    expect(messages.some((m: string) => m.includes("(HTTP"))).toBe(false); // No status code in this error message
    expect(messages.some((m: string) => m.includes("API key is missing"))).toBe(false);
  });

  it("rewrites 403 Forbidden error with HTTP status code for entraId", async () => {
    setupRewriteProvider(entraIdSettings);
    mockSession.send.mockRejectedValueOnce(new Error("Request failed with status 403"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Entra ID authentication was rejected"))).toBe(true);
    expect(messages.some((m: string) => m.includes("(HTTP 403)"))).toBe(true);
    expect(messages.some((m: string) => m.includes("Cognitive Services OpenAI User"))).toBe(true);
  });

  it("rewrites 'forbidden' keyword error for entraId", async () => {
    setupRewriteProvider(entraIdSettings);
    mockSession.send.mockRejectedValueOnce(new Error("Forbidden: Access denied"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Entra ID authentication was rejected"))).toBe(true);
    expect(messages.some((m: string) => m.includes("(HTTP"))).toBe(false); // No numeric status in this message
  });

  it("rewrites 403 error for apiKey auth method", async () => {
    const apiKeySettings = {
      endpoint: "https://example.com",
      authMethod: "apiKey" as const,
      apiKey: "",
      wireApi: "completions" as const,
      cliPath: "",
      models: ["gpt-4"],
    };
    setupRewriteProvider(apiKeySettings, "test-key");
    mockSession.send.mockRejectedValueOnce(new Error("403 Forbidden"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("API key is missing or invalid"))).toBe(true);
    expect(messages.some((m: string) => m.includes("(HTTP 403)"))).toBe(true);
  });

  it("does not rewrite non-auth errors when authMethod is entraId", async () => {
    setupRewriteProvider(entraIdSettings);
    mockSession.send.mockRejectedValueOnce(new Error("Network timeout after 30s"));

    simulateUserMessage(mockView, "hello");

    await vi.waitFor(() => {
      const errors = getPostedMessagesOfType(mockView, "error");
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    const errors = getPostedMessagesOfType(mockView, "error");
    const messages = errors.map((e: unknown) => (e as { message: string }).message);
    expect(messages.some((m: string) => m.includes("Network timeout after 30s"))).toBe(true);
    expect(messages.some((m: string) => m.includes("Entra ID"))).toBe(false);
  });
});
