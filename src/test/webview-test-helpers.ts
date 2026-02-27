import { vi } from "vitest";

type MessageHandler = (message: unknown) => void;

export interface MockWebview {
  postMessage: ReturnType<typeof vi.fn>;
  onDidReceiveMessage: ReturnType<typeof vi.fn>;
  html: string;
  options: Record<string, unknown>;
  asWebviewUri: ReturnType<typeof vi.fn>;
  cspSource: string;
  _messageHandlers: MessageHandler[];
}

export interface MockWebviewView {
  webview: MockWebview;
  viewType: string;
  title?: string;
  description?: string;
  onDidDispose: ReturnType<typeof vi.fn>;
  onDidChangeVisibility: ReturnType<typeof vi.fn>;
  visible: boolean;
}

/**
 * Creates a mock webview with postMessage spy and onDidReceiveMessage trigger.
 */
export function createMockWebview(): MockWebview {
  const handlers: MessageHandler[] = [];
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    onDidReceiveMessage: vi.fn((handler: MessageHandler) => {
      handlers.push(handler);
      return { dispose: vi.fn() };
    }),
    html: "",
    options: {},
    asWebviewUri: vi.fn((uri: unknown) => uri),
    cspSource: "mock-csp",
    _messageHandlers: handlers,
  };
}

/**
 * Creates a mock WebviewView with a mock webview object.
 */
export function createMockWebviewView(): MockWebviewView {
  return {
    webview: createMockWebview(),
    viewType: "forge.chatView",
    onDidDispose: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    onDidChangeVisibility: vi.fn().mockReturnValue({ dispose: vi.fn() }),
    visible: true,
  };
}

/**
 * Creates a mock WebviewViewResolveContext.
 */
export function createMockResolveContext(): { state: unknown } {
  return { state: undefined };
}

/**
 * Creates a mock CancellationToken.
 */
export function createMockCancellationToken(): {
  isCancellationRequested: boolean;
  onCancellationRequested: ReturnType<typeof vi.fn>;
} {
  return {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
}

/**
 * Simulates a user sending a message via the webview.
 */
export function simulateUserMessage(view: MockWebviewView, text: string): void {
  for (const handler of view.webview._messageHandlers) {
    handler({ command: "sendMessage", text });
  }
}

/**
 * Simulates user clicking "New Conversation".
 */
export function simulateNewConversation(view: MockWebviewView): void {
  for (const handler of view.webview._messageHandlers) {
    handler({ command: "newConversation" });
  }
}

/**
 * Returns all messages posted to the webview via postMessage.
 */
export function getPostedMessages(view: MockWebviewView): unknown[] {
  return view.webview.postMessage.mock.calls.map(
    (call: unknown[]) => call[0]
  );
}

/**
 * Returns all posted messages filtered by type.
 */
export function getPostedMessagesOfType(
  view: MockWebviewView,
  type: string
): unknown[] {
  return getPostedMessages(view).filter(
    (msg: unknown) => (msg as { type: string }).type === type
  );
}
