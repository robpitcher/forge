import { ExtensionConfig } from "./configuration.js";
import type {
  CopilotClient,
  ICopilotSession,
  MCPLocalServerConfig,
  MCPRemoteServerConfig,
  PermissionHandler,
  ProviderConfig,
  RemoteMcpSettings,
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
 * Maps our simplified McpServerConfig / RemoteMcpSettings to the SDK's
 * MCPLocalServerConfig or MCPRemoteServerConfig shape. Supports both local
 * (stdio) and remote (HTTP/SSE) transports.
 */
function buildMcpServersConfig(config: ExtensionConfig): Record<string, MCPLocalServerConfig | MCPRemoteServerConfig> | undefined {
  if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
    return undefined;
  }

  const mcpServers: Record<string, MCPLocalServerConfig | MCPRemoteServerConfig> = {};
  for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
    if ('url' in serverConfig) {
      const remote = serverConfig as RemoteMcpSettings;
      mcpServers[name] = {
        type: "http" as const,
        url: remote.url,
        tools: ["*"],
        ...(remote.headers && { headers: remote.headers }),
      };
    } else {
      mcpServers[name] = {
        type: "local" as const,
        command: serverConfig.command,
        args: serverConfig.args ?? [],
        tools: ["*"],
        ...(serverConfig.env && { env: serverConfig.env }),
      };
    }
  }
  return mcpServers;
}

/** The three chat modes supported by the extension. */
export type ChatMode = "chat" | "agent" | "plan";

/** Tools excluded in Chat mode \u2014 read-only, no modifications. */
const CHAT_MODE_EXCLUDED_TOOLS = ["shell", "write", "url", "mcp"];

/** System message prefix prepended in Plan mode. */
const PLAN_MODE_SYSTEM_PREFIX =
  "Before executing any actions, first create a step-by-step plan and present it to the user for approval.";

/**
 * Builds tool configuration from individual boolean settings and the active chat mode.
 */
export function buildToolConfig(config: ExtensionConfig, mode: ChatMode = "agent"): Record<string, unknown> {
  const excludedTools: string[] = [];

  if (mode === "chat") {
    for (const tool of CHAT_MODE_EXCLUDED_TOOLS) {
      if (!excludedTools.includes(tool)) {
        excludedTools.push(tool);
      }
    }
  } else {
    if (!config.toolShell) excludedTools.push("shell");
    if (!config.toolWrite) excludedTools.push("write");
    if (!config.toolUrl) excludedTools.push("url");
    if (!config.toolMcp) excludedTools.push("mcp");
  }

  // Read tool is always governed by the per-tool setting
  if (!config.toolRead) excludedTools.push("read");

  if (excludedTools.length > 0) {
    return { excludedTools };
  }
  return {};
}

/**
 * Builds the system message, merging user config with mode-specific prefixes.
 */
function buildSystemMessage(config: ExtensionConfig, mode: ChatMode): { content: string } | undefined {
  const parts: string[] = [];
  if (mode === "plan") {
    parts.push(PLAN_MODE_SYSTEM_PREFIX);
  }
  if (config.systemMessage) {
    parts.push(config.systemMessage);
  }
  if (parts.length === 0) {
    return undefined;
  }
  return { content: parts.join("\n\n") };
}


export async function getOrCreateSession(
  conversationId: string,
  config: ExtensionConfig,
  authToken: string,
  onPermissionRequest?: PermissionHandler,
  mode: ChatMode = "agent",
): Promise<ICopilotSession> {
  const existing = sessions.get(conversationId);
  if (existing) {
    return existing;
  }

  const copilotClient = await getOrCreateClient(config);
  const provider = buildProviderConfig(config, authToken);
  const toolConfig = buildToolConfig(config, mode);
  const mcpServers = buildMcpServersConfig(config);
  const systemMessage = buildSystemMessage(config, mode);

  const session = (await copilotClient.createSession({
    sessionId: conversationId,
    model: config.model,
    provider,
    streaming: true,
    ...toolConfig,
    ...(mcpServers && { mcpServers }),
    ...(systemMessage && { systemMessage }),
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
  mode: ChatMode = "agent",
): Promise<ICopilotSession> {
  try {
    const copilotClient = await getOrCreateClient(config);
    const provider = buildProviderConfig(config, authToken);
    const toolConfig = buildToolConfig(config, mode);
    const mcpServers = buildMcpServersConfig(config);
    const systemMessage = buildSystemMessage(config, mode);

    const resumeConfig: ResumeSessionConfig = {
      model: config.model,
      provider,
      streaming: true,
      ...toolConfig,
      ...(mcpServers && { mcpServers }),
      ...(systemMessage && { systemMessage }),
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
