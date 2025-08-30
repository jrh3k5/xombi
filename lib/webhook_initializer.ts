import { Client } from "@xmtp/node-sdk";
import { WebhookServer } from "../webhook/server";
import { MemoryRequestTracker } from "../state/request_tracker";
import { XMTPNotifier } from "../webhook/notify";
import { WebhookManager } from "../ombi/webhook";
import { buildWebhookURL } from "./network";

/**
 * Configuration interface for webhook system setup.
 * Contains all settings needed to initialize webhook notifications.
 */
export interface WebhookConfig {
  enabled: boolean;
  applicationKey?: string;
  baseUrl?: string;
  allowlistedIPs?: string[];
  ombiApiUrl?: string;
  ombiApiKey?: string;
  port?: number;
  debugEnabled?: boolean;
}

/**
 * Container for all webhook system components after initialization.
 * Used to manage the lifecycle of the webhook notification system.
 */
export interface WebhookSystemComponents {
  requestTracker: MemoryRequestTracker;
  webhookServer: WebhookServer;
  webhookManager: WebhookManager;
  xmtpNotifier: XMTPNotifier;
}

/**
 * Utility class for initializing and configuring the webhook notification system.
 * Handles environment variable parsing, component creation, and system startup.
 */
export class WebhookInitializer {
  /**
   * Parse webhook configuration from environment variables.
   * @returns Parsed webhook configuration object
   */
  static parseEnvironmentConfig(): WebhookConfig {
    const enabled =
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED?.toLowerCase() === "true";

    if (!enabled) {
      return { enabled: false };
    }

    const applicationKey = process.env.OMBI_XOMBI_APPLICATION_KEY;
    const baseUrl = process.env.OMBI_XOMBI_WEBHOOK_BASE_URL;
    const ombiApiUrl = process.env.OMBI_API_URL || "http://localhost:5000";
    const ombiApiKey = process.env.OMBI_API_KEY;

    const port = process.env.OMBI_XOMBI_WEBHOOK_PORT
      ? parseInt(process.env.OMBI_XOMBI_WEBHOOK_PORT, 10) || 3000
      : 3000;

    let allowlistedIPs: string[] = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
    const configuredAllowlistedIPs =
      process.env.OMBI_XOMBI_WEBHOOK_ALLOWLISTED_IPS;
    if (configuredAllowlistedIPs) {
      allowlistedIPs = configuredAllowlistedIPs.split(",");
    }

    const debugEnabled = process.env.DEBUG_OMBI_WEBHOOK === "true";

    return {
      enabled,
      applicationKey,
      baseUrl,
      allowlistedIPs,
      ombiApiUrl,
      ombiApiKey,
      port,
      debugEnabled,
    };
  }

  /**
   * Validate webhook configuration and throw errors for missing required fields.
   * @param config The webhook configuration to validate
   * @throws Error if required configuration is missing when webhooks are enabled
   */
  static validateConfig(config: WebhookConfig): void {
    if (!config.enabled) {
      return; // No validation needed for disabled webhooks
    }

    if (!config.applicationKey) {
      throw new Error(
        "OMBI_XOMBI_APPLICATION_KEY environment variable is required when webhooks are enabled",
      );
    }

    if (!config.ombiApiKey) {
      throw new Error("OMBI_API_KEY environment variable is required");
    }
  }

  /**
   * Initialize the complete webhook system with all components.
   * Creates and starts the webhook server, registers with Ombi, and sets up notifications.
   * @param config Validated webhook configuration
   * @param xmtpClient XMTP client for sending notifications
   * @returns Initialized webhook system components, or null if disabled
   * @throws Error if system initialization fails
   */
  static async initializeWebhookSystem(
    config: WebhookConfig,
    xmtpClient: Client,
  ): Promise<WebhookSystemComponents | null> {
    if (!config.enabled) {
      console.log("Webhook notifications disabled");
      return null;
    }

    if (!config.applicationKey) {
      throw new Error(
        "An application key is required for webhook integrations.",
      );
    }

    this.validateConfig(config);
    console.log("Webhook notifications enabled - setting up webhook system");

    // Initialize components
    const requestTracker = new MemoryRequestTracker();
    const webhookServer = new WebhookServer(
      requestTracker,
      config.applicationKey!,
      config.allowlistedIPs!,
      true, // trustProxy
      config.debugEnabled,
    );
    const webhookManager = new WebhookManager(
      config.ombiApiUrl!,
      config.ombiApiKey!,
    );
    const xmtpNotifier = new XMTPNotifier(xmtpClient);

    // Set up notification handler
    webhookServer.setNotificationHandler(
      async (address: string, message: string) => {
        await xmtpNotifier.sendNotification(address, message);
      },
    );

    // Start webhook server
    const webhookPort = config.port || 3000;
    await webhookServer.start(webhookPort);

    // Register webhook with Ombi
    let webhookUrl: string;

    if (config.baseUrl) {
      webhookUrl = `${config.baseUrl}/webhook`;
      console.log(`Using custom webhook base URL: ${config.baseUrl}`);
    } else {
      webhookUrl = buildWebhookURL(webhookPort);
    }

    console.log(`Registering webhook URL: ${webhookUrl}`);
    const registered = await webhookManager.registerWebhook(
      webhookUrl,
      config.applicationKey,
    );
    if (registered) {
      console.log("Webhook successfully registered with Ombi");
    } else {
      throw new Error("Failed to register webhook with Ombi");
    }

    return {
      requestTracker,
      webhookServer,
      webhookManager,
      xmtpNotifier,
    };
  }
}
