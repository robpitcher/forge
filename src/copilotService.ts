import { ExtensionConfig } from "./configuration.js";
import type { CopilotClient, ICopilotSession, PermissionHandler, ProviderConfig } from "./types.js";

let client: CopilotClient | undefined;
const sessions = new Map<string, ICopilotSession>();

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
        "Copilot CLI not found. Please install it or set the path in forge.copilot.cliPath"
      );
    }
    throw err;
  }

  return client;
}

export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  const existing = sessions.get(conversationId);
  if (existing) {
    return existing;
  }

  const copilotClient = await getOrCreateClient(config);

  const wireApi =
    config.wireApi === "completions" || config.wireApi === "responses"
      ? config.wireApi
      : undefined;

  // Auth strategy:
  // - apiKey mode: static API key passed as `apiKey` in ProviderConfig.
  // - entraId mode: bearer token from DefaultAzureCredential passed as `bearerToken`.
  //   Session-per-conversation means token refresh at session creation is sufficient
  //   (~1 hr token lifetime).
  // TODO(#27): If Copilot SDK adds native Entra / managed-identity support, refactor
  //   to use SDK-native auth instead of manual token acquisition.
  const isAzure = /\.azure\.com/i.test(config.endpoint);
  const provider: ProviderConfig = {
    type: isAzure ? "azure" : "openai",
    baseUrl: config.endpoint,
    wireApi,
    ...(config.authMethod === "entraId"
      ? { bearerToken: authToken }
      : { apiKey: authToken }),
    ...(isAzure && { azure: { apiVersion: "2024-10-21" } }),
  };
  const session = (await copilotClient.createSession({
    model: config.model,
    provider,
    streaming: true,
    ...(config.systemMessage && { systemMessage: { content: config.systemMessage } }),
    ...(onPermissionRequest && { onPermissionRequest }),
  })) as unknown as ICopilotSession;

  sessions.set(conversationId, session);
  return session;
}

export function removeSession(conversationId: string): void {
  sessions.delete(conversationId);
}

export async function destroySession(conversationId: string): Promise<void> {
  const session = sessions.get(conversationId);
  if (!session) {
    return;
  }

  try {
    await session.abort();
  } catch (err) {
    // Session may already be ended — log and continue
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Failed to abort session ${conversationId}: ${message}`);
  }

  sessions.delete(conversationId);
}

export async function destroyAllSessions(): Promise<void> {
  const abortPromises: Promise<void>[] = [];

  for (const [conversationId, session] of sessions.entries()) {
    if (!session) {
      console.warn(`Session ${conversationId} is undefined, skipping abort`);
      continue;
    }
    let abortPromise: Promise<void>;
    try {
      abortPromise = session.abort();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to abort session ${conversationId}: ${message}`);
      continue;
    }
    abortPromises.push(
      abortPromise.catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Failed to abort session ${conversationId}: ${message}`);
      })
    );
  }

  await Promise.all(abortPromises);
  sessions.clear();
}

function getSessionCount(): number {
  return sessions.size;
}

export async function stopClient(): Promise<void> {
  await destroyAllSessions();
  if (client) {
    try {
      await client.stop();
    } finally {
      client = undefined;
    }
  }
}
