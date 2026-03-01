import { defineProxyService } from "@webext-core/proxy-service";
import { ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import { aiSettings } from "@/lib/storage/ai-settings";
import type {
  CDPAgentConfig,
  CDPAgentProgress,
  CDPAgentResult,
} from "@/types/cdp";
import { DEFAULT_CDP_AGENT_CONFIG } from "@/types/cdp";
import type { AISettings } from "@/types/settings";
import { CDPAgent } from "../ai/cdp-agent";
import { contentAutofillMessaging } from "../autofill/content-autofill-messaging";
import { CDPConnection } from "./cdp-connection";

const logger = createLogger("cdp-autofill-service");

class CDPAutofillService {
  private currentAiSettings: AISettings | null = null;
  private unwatchAiSettings?: () => void;
  private activeConnections = new Map<number, CDPConnection>();
  private activeAgents = new Map<number, CDPAgent>();

  constructor() {
    this.unwatchAiSettings = aiSettings.watch((newSettings) => {
      this.currentAiSettings = newSettings;
    });

    aiSettings.getValue().then((settings) => {
      this.currentAiSettings = settings;
    });
  }

  dispose(): void {
    this.unwatchAiSettings?.();
    this.unwatchAiSettings = undefined;

    // Detach all active connections
    for (const [tabId, connection] of this.activeConnections) {
      connection.detach().catch(() => {});
      logger.info(`Cleaned up CDP connection for tab ${tabId}`);
    }
    this.activeConnections.clear();
    this.activeAgents.clear();

    logger.info("CDPAutofillService disposed");
  }

  /**
   * Start the CDP agent loop on the active tab.
   * This is the main entry point — attaches debugger, runs the AI loop, detaches.
   */
  async startAgentOnActiveTab(
    config?: Partial<CDPAgentConfig>,
  ): Promise<CDPAgentResult> {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab.id) {
      throw new Error("No active tab found");
    }

    return this.startAgentOnTab(tab.id, config);
  }

  /**
   * Start the CDP agent loop on a specific tab.
   */
  async startAgentOnTab(
    tabId: number,
    config?: Partial<CDPAgentConfig>,
  ): Promise<CDPAgentResult> {
    // Prevent duplicate sessions on the same tab
    if (this.activeConnections.has(tabId)) {
      throw new Error("CDP agent is already running on this tab");
    }

    const agentConfig: CDPAgentConfig = {
      ...DEFAULT_CDP_AGENT_CONFIG,
      ...config,
    };

    const connection = new CDPConnection(tabId);
    this.activeConnections.set(tabId, connection);

    try {
      // Send initial progress
      this.sendProgress(tabId, {
        state: "connecting",
        message: "Connecting to page via CDP...",
        stepNumber: 0,
        maxSteps: agentConfig.maxSteps,
      });

      // Attach debugger
      await connection.attach();
      await connection.initializeForAgentLoop();

      // Handle external detach
      connection.onDetach(() => {
        logger.warn(`CDP detached externally for tab ${tabId}`);
        this.cleanup(tabId);
        this.sendProgress(tabId, {
          state: "disconnected",
          message: "Debugger was disconnected",
          stepNumber: 0,
          maxSteps: agentConfig.maxSteps,
        });
      });

      // Load memories
      const memories = await storage.memories.getValue();

      if (memories.length === 0) {
        await this.cleanup(tabId);
        return {
          success: false,
          totalSteps: 0,
          steps: [],
          duration: 0,
          summary: "No memories stored",
          error: "No memories available to fill forms with",
        };
      }

      // Get AI provider configuration
      const { provider, apiKey, modelName } = await this.getAIConfiguration();

      // Build the task description
      const tab = await browser.tabs.get(tabId);
      const task = `Fill out all form fields on this page (${tab.url || "unknown URL"}) using the user's stored information. Do not submit the form.`;

      // Create and run the agent
      const agent = new CDPAgent({
        connection,
        config: agentConfig,
        memories,
        provider,
        apiKey,
        modelName,
        task,
        onProgress: (progress) => this.sendProgress(tabId, progress),
      });

      this.activeAgents.set(tabId, agent);

      logger.info(
        `Starting CDP agent on tab ${tabId} with ${memories.length} memories`,
      );

      const result = await agent.run();

      logger.info(
        `CDP agent completed on tab ${tabId}: ${result.totalSteps} steps, ${result.success ? "success" : "failed"}`,
      );

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("CDP agent failed:", error);

      this.sendProgress(tabId, {
        state: "failed",
        message: `Failed: ${message}`,
        stepNumber: 0,
        maxSteps: agentConfig.maxSteps,
      });

      return {
        success: false,
        totalSteps: 0,
        steps: [],
        duration: 0,
        summary: "Failed to run",
        error: message,
      };
    } finally {
      await this.cleanup(tabId);
    }
  }

  /**
   * Abort the running agent on a tab.
   */
  async abortAgent(tabId: number): Promise<void> {
    const agent = this.activeAgents.get(tabId);
    if (agent) {
      agent.abort();
      logger.info(`Abort requested for tab ${tabId}`);
    }
  }

  /**
   * Check if an agent is currently running on a tab.
   */
  isRunning(tabId: number): boolean {
    return this.activeConnections.has(tabId);
  }

  private async getAIConfiguration(): Promise<{
    provider: AIProvider;
    apiKey: string;
    modelName?: string;
  }> {
    const settings = this.currentAiSettings;
    if (!settings) {
      throw new Error("AI settings not loaded");
    }

    // For CDP agent, we prefer vision-capable models
    const provider = settings.selectedProvider;
    if (!provider) {
      throw new Error(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED);
    }

    const keyVaultService = getKeyVaultService();
    const apiKey = await keyVaultService.getKey(provider);

    if (!apiKey) {
      throw new Error(
        `No API key configured for ${provider}. Please add your API key in settings.`,
      );
    }

    // Use the user's selected model, or let the model factory pick the default
    const modelName = settings.selectedModels?.[provider];

    return { provider, apiKey, modelName };
  }

  private sendProgress(tabId: number, progress: CDPAgentProgress): void {
    try {
      contentAutofillMessaging
        .sendMessage(
          "updateProgress",
          {
            state: "matching" as const,
            message: `[CDP Agent] ${progress.message}`,
            fieldsDetected: progress.stepNumber,
            fieldsMatched: progress.maxSteps,
          },
          tabId,
        )
        .catch(() => {
          // Tab may not have content script, that's okay
        });
    } catch {
      // Ignore messaging errors
    }
  }

  private async cleanup(tabId: number): Promise<void> {
    const connection = this.activeConnections.get(tabId);
    if (connection) {
      try {
        await connection.cleanupDomains();
        await connection.detach();
      } catch {
        // Tab may already be closed
      }
      this.activeConnections.delete(tabId);
    }
    this.activeAgents.delete(tabId);
  }
}

export const [registerCDPAutofillService, getCDPAutofillService] =
  defineProxyService("CDPAutofillService", () => new CDPAutofillService());
