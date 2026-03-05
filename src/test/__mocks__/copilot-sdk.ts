import { vi } from "vitest";
import { EventEmitter } from "events";

export function createMockSession() {
  const emitter = new EventEmitter();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
      return () => { emitter.off(event, handler); };
    }),
    send: vi.fn().mockResolvedValue("msg-1"),
    abort: vi.fn().mockResolvedValue(undefined),
    _emit: (event: string, data?: unknown) => emitter.emit(event, data),
  };
}

export interface MockClient {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  resumeSession: ReturnType<typeof vi.fn>;
  getLastSessionId: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
}

export function createMockClient(
  session: ReturnType<typeof createMockSession>
): MockClient {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue(session),
    listSessions: vi.fn().mockResolvedValue([]),
    resumeSession: vi.fn().mockResolvedValue(session),
    getLastSessionId: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
  };
}

let _mockClient: MockClient | undefined;

export function setMockClient(client: MockClient) {
  _mockClient = client;
}

export const constructorSpy = vi.fn();

export class CopilotClient {
  start: MockClient["start"];
  stop: MockClient["stop"];
  createSession: MockClient["createSession"];
  listSessions: MockClient["listSessions"];
  resumeSession: MockClient["resumeSession"];
  getLastSessionId: MockClient["getLastSessionId"];
  deleteSession: MockClient["deleteSession"];

  constructor(options?: Record<string, unknown>) {
    constructorSpy(options);
    if (!_mockClient) {
      throw new Error("Call setMockClient() before creating a CopilotClient");
    }
    this.start = _mockClient.start;
    this.stop = _mockClient.stop;
    this.createSession = _mockClient.createSession;
    this.listSessions = _mockClient.listSessions;
    this.resumeSession = _mockClient.resumeSession;
    this.getLastSessionId = _mockClient.getLastSessionId;
    this.deleteSession = _mockClient.deleteSession;
  }
}
