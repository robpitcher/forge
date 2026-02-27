import { vi } from "vitest";
import { EventEmitter } from "events";

export function createMockSession() {
  const emitter = new EventEmitter();
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.on(event, handler);
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.once(event, handler);
    }),
    off: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      emitter.off(event, handler);
    }),
    removeListener: vi.fn(
      (event: string, handler: (...args: unknown[]) => void) => {
        emitter.removeListener(event, handler);
      }
    ),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    abort: vi.fn().mockResolvedValue(undefined),
    _emit: (event: string, data?: unknown) => emitter.emit(event, data),
  };
}

export interface MockClient {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  createSession: ReturnType<typeof vi.fn>;
}

export function createMockClient(
  session: ReturnType<typeof createMockSession>
): MockClient {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    createSession: vi.fn().mockResolvedValue(session),
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

  constructor(options?: Record<string, unknown>) {
    constructorSpy(options);
    if (!_mockClient) {
      throw new Error("Call setMockClient() before creating a CopilotClient");
    }
    this.start = _mockClient.start;
    this.stop = _mockClient.stop;
    this.createSession = _mockClient.createSession;
  }
}
