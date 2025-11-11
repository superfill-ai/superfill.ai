import { ConvexHttpClient } from "convex/browser";
import { createLogger } from "@/lib/logger";

const logger = createLogger("convex-client");

export class ConvexClientManager {
  private client: ConvexHttpClient | null = null;
  private authToken: string | null = null;

  constructor() {
    const convexUrl = import.meta.env.WXT_CONVEX_URL;
    if (!convexUrl) {
      logger.error("CONVEX_URL environment variable is not set");
      throw new Error("CONVEX_URL is required for sync");
    }
  }

  async initialize(token: string): Promise<void> {
    try {
      this.authToken = token;
      const convexUrl = import.meta.env.WXT_CONVEX_URL;

      if (!convexUrl) {
        throw new Error("CONVEX_URL is required");
      }

      this.client = new ConvexHttpClient(convexUrl);
      this.client.setAuth(token);

      logger.info("Convex client initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize Convex client", { error });
      throw error;
    }
  }

  getClient(): ConvexHttpClient {
    if (!this.client) {
      throw new Error(
        "Convex client not initialized. Call initialize() first.",
      );
    }
    return this.client;
  }

  isInitialized(): boolean {
    return this.client !== null && this.authToken !== null;
  }

  clearAuth(): void {
    this.authToken = null;
    this.client = null;
    logger.info("Convex client auth cleared");
  }

  updateAuth(token: string): void {
    if (!this.client) {
      throw new Error("Client not initialized");
    }
    this.authToken = token;
    this.client.setAuth(token);
    logger.info("Convex client auth updated");
  }
}

let convexClientInstance: ConvexClientManager | null = null;

export function getConvexClient(): ConvexClientManager {
  if (!convexClientInstance) {
    convexClientInstance = new ConvexClientManager();
  }
  return convexClientInstance;
}
