import { ExtensionConfig } from "./configuration.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CopilotClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CopilotSession = any;

let client: CopilotClient | undefined;
const sessions = new Map<string, CopilotSession>();

export class CopilotCliNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopilotCliNotFoundError";
  }
}

export async function getOrCreateClient(
  config: ExtensionConfig
): Promise<CopilotClient> {
  if (client) {
    return client;
  }

  const { CopilotClient: SDKCopilotClient } = await import(
    "@github/copilot-sdk"
  );

  const clientOptions: Record<string, unknown> = {};
  if (config.cliPath) {
    clientOptions.cliPath = config.cliPath;
  }

  try {
    client = new SDKCopilotClient(clientOptions);
    await client.start();
  } catch (err: unknown) {
    client = undefined;
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.toLowerCase().includes("not found") ||
      message.toLowerCase().includes("enoent") ||
      message.toLowerCase().includes("cannot find")
    ) {
      throw new CopilotCliNotFoundError(
        "Copilot CLI not found. Please install it or set the path in airgapped.copilot.cliPath"
      );
    }
    throw err;
  }

  return client;
}

export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig
): Promise<CopilotSession> {
  const existing = sessions.get(conversationId);
  if (existing) {
    return existing;
  }

  const copilotClient = await getOrCreateClient(config);

  const session = await copilotClient.createSession({
    model: config.model,
    provider: {
      type: "openai",
      baseUrl: config.endpoint,
      apiKey: config.apiKey,
      wireApi: config.wireApi,
    },
    streaming: true,
    availableTools: [],
  });

  sessions.set(conversationId, session);
  return session;
}

export function removeSession(conversationId: string): void {
  sessions.delete(conversationId);
}

export async function stopClient(): Promise<void> {
  sessions.clear();
  if (client) {
    try {
      await client.stop();
    } finally {
      client = undefined;
    }
  }
}
