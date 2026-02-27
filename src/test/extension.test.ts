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

vi.mock("@github/copilot-sdk", () =>
  import("./__mocks__/copilot-sdk.js")
);

describe("handleChatRequest integration", () => {
  let mockSession: ReturnType<typeof createMockSession>;
  let mockClient: MockClient;
  let capturedHandler: (
    request: unknown,
    context: unknown,
    stream: unknown,
    token: unknown
  ) => Promise<void>;

  beforeEach(() => {
    mockSession = createMockSession();
    mockClient = createMockClient(mockSession);
    setMockClient(mockClient);

    // Configure vscode mocks for valid settings
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

    // Capture the handler registered by activate()
    vi.mocked(vscode.chat.createChatParticipant).mockReturnValue({
      iconPath: null,
      dispose: vi.fn(),
    } as unknown as ReturnType<typeof vscode.chat.createChatParticipant>);

    const mockContext = {
      subscriptions: [] as { dispose: () => void }[],
    };
    activate(mockContext as unknown as import("vscode").ExtensionContext);

    // Extract the handler passed to createChatParticipant
    const calls = vi.mocked(vscode.chat.createChatParticipant).mock.calls;
    capturedHandler = calls[calls.length - 1][1] as typeof capturedHandler;
  });

  afterEach(async () => {
    await stopClient();
    vi.mocked(vscode.chat.createChatParticipant).mockClear();
  });

  it("streams markdown content from session deltas to the response stream", async () => {
    const stream = { markdown: vi.fn(), button: vi.fn() };
    const token = {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    };
    const request = { prompt: "Hello world" };
    const context = { id: "test-conv-1" };

    // Make sendMessage trigger deltas then idle
    mockSession.sendMessage.mockImplementation(async () => {
      mockSession._emit("assistant.message_delta", {
        delta: { content: "Hello " },
      });
      mockSession._emit("assistant.message_delta", {
        delta: { content: "there!" },
      });
      mockSession._emit("session.idle");
    });

    await capturedHandler(request, context, stream, token);

    expect(stream.markdown).toHaveBeenCalledWith("Hello ");
    expect(stream.markdown).toHaveBeenCalledWith("there!");
    expect(mockSession.sendMessage).toHaveBeenCalledWith({
      role: "user",
      content: "Hello world",
    });
  });
});
