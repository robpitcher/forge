import { execSync, execFileSync } from "child_process";
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
const sessionConfigHashes = new Map<string, string>();

/**
 * Result of validating the copilot CLI binary.
 */
export type CopilotCliValidationResult =
  | { valid: true; version: string; path: string }
  | { valid: false; reason: "not_found" | "wrong_binary" | "version_check_failed"; path?: string; details?: string };

/**
 * Attempts to find the `copilot` CLI binary on PATH.
 * Returns the resolved path or undefined if not found.
 */
function resolveCopilotCliFromPath(): string | undefined {
  try {
    const cmd = process.platform === "win32" ? "where copilot" : "which copilot";
    const result = execSync(cmd, { encoding: "utf8", timeout: 5000 })
      .trim()
      .split("\n")[0];
    return result || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Validates that a CLI binary is actually the @github/copilot CLI.
 * 
 * Runs `<cliPath> --version` and checks that it returns a version number without error.
 * The @github/copilot CLI supports `--version` and returns version output; other `copilot`
 * binaries may not support this flag or may fail.
 * 
 * @param cliPath - Path to the CLI binary to validate
 * @returns Validation result with version string if valid, or error details if invalid
 */
export function validateCopilotCli(cliPath: string): Promise<CopilotCliValidationResult> {
  return new Promise((resolve) => {
    try {
      const output = execFileSync(cliPath, ["--version"], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();

      // If we got output without error, check if it looks like a version
      // The @github/copilot CLI returns version info. We just need to verify
      // it didn't error out (wrong binary might not support --version)
      if (output && output.length > 0) {
        resolve({ valid: true, version: output, path: cliPath });
      } else {
        resolve({
          valid: false,
          reason: "version_check_failed",
          path: cliPath,
          details: "No version output returned",
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const lower = message.toLowerCase();

      // Check if binary wasn't found
      if (lower.includes("enoent") || lower.includes("not found") || lower.includes("cannot find")) {
        resolve({
          valid: false,
          reason: "not_found",
          path: cliPath,
          details: message,
        });
      } else {
        // Binary exists but returned error — likely wrong binary
        resolve({
          valid: false,
          reason: "wrong_binary",
          path: cliPath,
          details: message,
        });
      }
    }
  });
}

/**
 * Discovers and validates the Copilot CLI binary.
 * 
 * If a configuredPath is provided, validates it directly. Otherwise, searches PATH
 * using resolveCopilotCliFromPath() and validates the result.
 * 
 * @param configuredPath - Optional explicit CLI path from user configuration
 * @returns Validation result with discovered/configured CLI path
 */
export async function discoverAndValidateCli(configuredPath?: string): Promise<CopilotCliValidationResult> {
  // If configured path is provided, validate it directly
  if (configuredPath && configuredPath.trim() !== "") {
    return validateCopilotCli(configuredPath);
  }

  // Otherwise, discover from PATH
  const discoveredPath = resolveCopilotCliFromPath();
  if (!discoveredPath) {
    return {
      valid: false,
      reason: "not_found",
      details: "No copilot binary found on PATH and no cliPath configured",
    };
  }

  // Validate the discovered binary
  return validateCopilotCli(discoveredPath);
}

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
  } else {
    const resolved = resolveCopilotCliFromPath();
    if (resolved) {
      clientOptions.cliPath = resolved;
    }
  }

  try {
    client = new SDKCopilotClient(clientOptions);
    await client.start();
  } catch (err: unknown) {
    client = undefined;
    const message = err instanceof Error ? err.message : String(err);
    const lower = message.toLowerCase();
    if (
      lower.includes("--headless") ||
      lower.includes("unknown option") ||
      (lower.includes("exited with code") && lower.includes("stderr"))
    ) {
      throw new CopilotCliNotFoundError(
        "The 'copilot' binary found on your PATH does not appear to be the GitHub Copilot CLI (@github/copilot). " +
        "Install it with: npm install -g @github/copilot — then restart VS Code. " +
        "Or set forge.copilot.cliPath to the correct binary location."
      );
    }
    if (
      lower.includes("not found") ||
      lower.includes("enoent") ||
      lower.includes("cannot find") ||
      lower.includes("cannot resolve")
    ) {
      throw new CopilotCliNotFoundError(
        "Copilot CLI not found. Install @github/copilot globally or set forge.copilot.cliPath in settings."
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
  //   NOTE: bearerToken is static — Entra ID tokens expire after ~1hr.
  //   Long sessions may need session rotation. Tracked in #27.
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
      console.warn(`[forge] MCP server "${name}" configured with command: ${serverConfig.command}`);
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

/**
 * Builds tool configuration from individual boolean settings.
 */
function buildToolConfig(config: ExtensionConfig): { excludedTools?: string[] } {
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
  model: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  const configHash = config.endpoint + "|" + config.authMethod + "|" + model + "|" + config.wireApi + "|" + authToken;
  const existing = sessions.get(conversationId);
  if (existing) {
    if (sessionConfigHashes.get(conversationId) === configHash) {
      return existing;
    }
    await destroySession(conversationId);
  }

  const copilotClient = await getOrCreateClient(config);
  const provider = buildProviderConfig(config, authToken);
  const toolConfig = buildToolConfig(config);
  const mcpServers = buildMcpServersConfig(config);

  const session = (await copilotClient.createSession({
    sessionId: conversationId,
    model,
    provider,
    streaming: true,
    ...toolConfig,
    ...(mcpServers && { mcpServers }),
    ...(config.systemMessage && { systemMessage: { content: config.systemMessage } }),
    ...(onPermissionRequest && { onPermissionRequest }),
  })) as unknown as ICopilotSession;

  if (typeof session.send !== 'function' || typeof session.on !== 'function') {
    throw new Error('SDK session shape mismatch — check @github/copilot-sdk version');
  }

  sessions.set(conversationId, session);
  sessionConfigHashes.set(conversationId, configHash);
  return session;
}

/** Removes session from cache WITHOUT aborting. Use destroySession() for clean cleanup. */
export function removeSession(conversationId: string): void {
  sessions.delete(conversationId);
  sessionConfigHashes.delete(conversationId);
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
  sessionConfigHashes.delete(conversationId);
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
  sessionConfigHashes.clear();
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
  model: string,
  onPermissionRequest?: PermissionHandler,
): Promise<ICopilotSession> {
  try {
    const copilotClient = await getOrCreateClient(config);
    const provider = buildProviderConfig(config, authToken);
    const toolConfig = buildToolConfig(config);
    const mcpServers = buildMcpServersConfig(config);

    const resumeConfig: ResumeSessionConfig = {
      model,
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

    if (typeof session.send !== 'function' || typeof session.on !== 'function') {
      throw new Error('SDK session shape mismatch — check @github/copilot-sdk version');
    }

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
    sessionConfigHashes.delete(sessionId);
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

export function resetClient(): void {
  client = undefined;
  sessions.clear();
  sessionConfigHashes.clear();
}
