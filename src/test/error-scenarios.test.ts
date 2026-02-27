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
  removeSession,
  stopClient,
  CopilotCliNotFoundError,
} from "../copilotService.js";
import { activate } from "../extension.js";
import type { ExtensionConfig } from "../configuration.js";

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
// 3. Session error — session.error event during a conversation
// 4. General startup error — getOrCreateClient throws non-CLI error
// 5. sendMessage rejection
// 6. Config validation displayed — handleChatRequest shows errors + button
// 7. Session removed on error
// ---------------------------------------------------------------------------

describe("Error: handleChatRequest error paths", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let capturedHandler: (
    request: unknown,
    context: unknown,
    stream: unknown,
    token: unknown
  ) => Promise<void>;

  function makeStream() {
    return { markdown: vi.fn(), button: vi.fn() };
  }

  function makeToken() {
    return {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    };
  }

  function activateExtension(settings: Record<string, string>) {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
      get: vi.fn(
        (key: string, defaultValue: unknown) => settings[key] ?? defaultValue
      ),
    } as unknown as ReturnType<typeof vscode.workspace.getConfiguration>);

    vi.mocked(vscode.chat.createChatParticipant).mockReturnValue({
      iconPath: null,
      dispose: vi.fn(),
    } as unknown as ReturnType<typeof vscode.chat.createChatParticipant>);

    const mockContext = { subscriptions: [] as { dispose: () => void }[] };
    activate(mockContext as unknown as import("vscode").ExtensionContext);

    const calls = vi.mocked(vscode.chat.createChatParticipant).mock.calls;
    capturedHandler = calls[calls.length - 1][1] as typeof capturedHandler;
  }

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.chat.createChatParticipant).mockClear();
  });

  // (6) Config validation displayed
  it("shows validation errors with settings button when config is missing", async () => {
    activateExtension({
      endpoint: "",
      apiKey: "",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    const stream = makeStream();
    const token = makeToken();

    await capturedHandler({ prompt: "hello" }, { id: "conv-err-1" }, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("endpoint")
    );
    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("API key")
    );
    expect(stream.button).toHaveBeenCalledWith(
      expect.objectContaining({
        command: "workbench.action.openSettings",
        title: "Open Settings",
      })
    );
  });

  // (2 + extension layer) CopilotCliNotFoundError shown in chat
  it("displays CLI-not-found message in chat when CLI is missing", async () => {
    activateExtension({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockClient.start.mockRejectedValueOnce(new Error("spawn copilot ENOENT"));

    const stream = makeStream();
    const token = makeToken();

    await capturedHandler({ prompt: "hi" }, { id: "conv-err-2" }, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Copilot CLI not found")
    );
  });

  // (4) General startup error — non-CLI error
  it("displays general startup error when client throws non-CLI error", async () => {
    activateExtension({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockClient.start.mockRejectedValueOnce(new Error("Permission denied"));

    const stream = makeStream();
    const token = makeToken();

    await capturedHandler({ prompt: "hi" }, { id: "conv-err-3" }, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Failed to start Copilot service")
    );
    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Permission denied")
    );
  });

  // (3) Session error event during conversation
  it("shows error when session.error event fires during conversation", async () => {
    activateExtension({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockSession.sendMessage.mockImplementation(async () => {
      mockSession._emit("session.error", {
        error: { message: "Connection reset by peer" },
      });
    });

    const stream = makeStream();
    const token = makeToken();

    await capturedHandler({ prompt: "hi" }, { id: "conv-err-4" }, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Connection reset by peer")
    );
  });

  // (5) sendMessage rejection
  it("shows error when sendMessage rejects", async () => {
    activateExtension({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockSession.sendMessage.mockRejectedValueOnce(
      new Error("Network timeout")
    );

    const stream = makeStream();
    const token = makeToken();

    await capturedHandler({ prompt: "hi" }, { id: "conv-err-5" }, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith(
      expect.stringContaining("Network timeout")
    );
  });

  // (7) Session removed on error
  it("calls removeSession after a sendMessage error", async () => {
    activateExtension({
      endpoint: "https://example.com",
      apiKey: "key-123",
      model: "gpt-4.1",
      wireApi: "completions",
      cliPath: "",
    });

    mockSession.sendMessage.mockRejectedValueOnce(
      new Error("Server unavailable")
    );

    const stream = makeStream();
    const token = makeToken();
    const conversationId = "conv-err-6";

    await capturedHandler({ prompt: "hi" }, { id: conversationId }, stream, token);

    // Verify session was removed: next call should create a new session
    const newSession = createMockSession();
    mockClient.createSession.mockResolvedValueOnce(newSession);
    newSession.sendMessage.mockImplementation(async () => {
      newSession._emit("session.idle");
    });

    await capturedHandler({ prompt: "retry" }, { id: conversationId }, stream, token);

    // createSession should have been called twice: once for the first request, once after removal
    expect(mockClient.createSession).toHaveBeenCalledTimes(2);
  });
});
