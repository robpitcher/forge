import { ExtensionConfig } from "./configuration.js";
import type {
  CopilotClient,
  ICopilotSession,
  MCPLocalServerConfig,
  PermissionHandler,
  ProviderConfig,
  SessionMetadata,
  ConversationMetadata,
  ResumeSessionConfig,
} from "./types.js";

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

/**
 * Builds a provider configuration for BYOK mode.
 */
function buildProviderConfig(config: ExtensionConfig, authToken: string): ProviderConfig {
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
  return {
    type: isAzure ? "azure" : "openai",
    baseUrl: config.endpoint,
    wireApi,
    ...(config.authMethod === "entraId"
      ? { bearerToken: authToken }
      : { apiKey: authToken }),
    ...(isAzure && { azure: { apiVersion: "2024-10-21" } }),
  };
}

/**
 * Builds MCP server configuration for the SDK's createSession/resumeSession.
 *
 * Maps our simplified McpServerConfig to the SDK's MCPLocalServerConfig shape.
 * Only "local" (stdio) transport is supported — air-gap safe, no remote servers.
 */
function buildMcpServersConfig(config: ExtensionConfig): Record<string, MCPLocalServerConfig> | undefined {
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return undefined;
  }

  const mcpServers: Record<string, MCPLocalServerConfig> = {};
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    mcpServers[name] = {
      type: "local" as const,
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      tools: ["*"],
      ...(serverConfig.env && { env: serverConfig.env }),
    };
  }
  return mcpServers;
}

/**
 * Builds tool configuration from individual boolean settings.
 */
function buildToolConfig(config: ExtensionConfig): Record<string, unknown> {
  const excludedTools: string[] = [];
  if (!config.toolShell) excludedTools.push("shell");
  if (!config.toolRead) excludedTools.push("read");
  if (!config.toolWrite) excludedTools.push("write");
  if (!config.toolUrl) excludedTools.push("url");
  if (!config.toolMcp) excludedTools.push("mcp");
  
  if (excludedTools.length > 0) {
    return { excludedTools };
  }
  return {};
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
  const provider = buildProviderConfig(config, authToken);
  const toolConfig = buildToolConfig(config);
  const mcpServers = buildMcpServersConfig(config);

  const session = (await copilotClient.createSession({
    sessionId: conversationId,
    model: config.model,
    provider,
    streaming: true,
    ...toolConfig,
    ...(mcpServers && { mcpServers }),
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

/**
 * Lists all available conversations.
 * 
 * Wraps the SDK's `client.listSessions()` and maps SessionMetadata to ConversationMetadata.
 */
export async function listConversations(config: ExtensionConfig): Promise<ConversationMetadata[]> {
  try {
    const copilotClient = await getOrCreateClient(config);
    const sessionList: SessionMetadata[] = await copilotClient.listSessions();
    
    return sessionList.map((s) => ({
      sessionId: s.sessionId,
      summary: s.summary,
      startTime: s.startTime,
      modifiedTime: s.modifiedTime,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list conversations: ${message}`);
  }
}

/**
 * Resumes an existing conversation by session ID.
 * 
 * Wraps the SDK's `client.resumeSession()`, applies the same provider and tool config
 * as `getOrCreateSession`, and stores the session in the local sessions map.
 */
export async function resumeConversation(
  sessionId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  try {
    const copilotClient = await getOrCreateClient(config);
    const provider = buildProviderConfig(config, authToken);
    const toolConfig = buildToolConfig(config);
    const mcpServers = buildMcpServersConfig(config);

    const resumeConfig: ResumeSessionConfig = {
      model: config.model,
      provider,
      streaming: true,
      ...toolConfig,
      ...(mcpServers && { mcpServers }),
      ...(config.systemMessage && { systemMessage: { content: config.systemMessage } }),
      ...(onPermissionRequest && { onPermissionRequest }),
    };

    const session = (await copilotClient.resumeSession(
      sessionId,
      resumeConfig
    )) as unknown as ICopilotSession;

    // Store in local sessions map so it can be managed alongside new sessions
    sessions.set(sessionId, session);
    return session;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to resume conversation ${sessionId}: ${message}. The session may not exist or may have been deleted.`
    );
  }
}

/**
 * Gets the ID of the most recently updated conversation.
 * 
 * Wraps the SDK's `client.getLastSessionId()`.
 */
export async function getLastConversationId(config: ExtensionConfig): Promise<string | undefined> {
  try {
    const copilotClient = await getOrCreateClient(config);
    return await copilotClient.getLastSessionId();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to get last conversation ID: ${message}`);
  }
}

/**
 * Deletes a conversation and its data from disk.
 * 
 * Wraps the SDK's `client.deleteSession()` and also removes the session
 * from the local sessions map if present.
 */
export async function deleteConversation(sessionId: string, config: ExtensionConfig): Promise<void> {
  try {
    const copilotClient = await getOrCreateClient(config);
    await copilotClient.deleteSession(sessionId);
    
    // Remove from local map if present
    sessions.delete(sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to delete conversation ${sessionId}: ${message}. The session may not exist or deletion may have failed.`
    );
  }
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
