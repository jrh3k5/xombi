import { Client } from "@xmtp/node-sdk";
import { WebhookServer } from "../webhook/server";
import { MemoryRequestTracker } from "../state/request_tracker";
import { XMTPNotifier } from "../webhook/notify";
import { WebhookManager } from "../ombi/webhook";
import { buildWebhookURL } from "./network";

export interface WebhookConfig {
  enabled: boolean;
  applicationKey?: string;
  baseUrl?: string;
  allowlistedIPs?: string[];
  ombiApiUrl?: string;
  ombiApiKey?: string;
  port?: number;
}

export interface WebhookSystemComponents {
  requestTracker: MemoryRequestTracker;
  webhookServer: WebhookServer;
  webhookManager: WebhookManager;
  xmtpNotifier: XMTPNotifier;
}

export class WebhookInitializer {
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

    return {
      enabled,
      applicationKey,
      baseUrl,
      allowlistedIPs,
      ombiApiUrl,
      ombiApiKey,
      port,
    };
  }

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

  static async initializeWebhookSystem(
    config: WebhookConfig,
    xmtpClient: Client,
  ): Promise<WebhookSystemComponents | null> {
    if (!config.enabled) {
      console.log("Webhook notifications disabled");
      return null;
    }

    this.validateConfig(config);
    console.log("Webhook notifications enabled - setting up webhook system");

    // Initialize components
    const requestTracker = new MemoryRequestTracker();
    const webhookServer = new WebhookServer(
      requestTracker,
      config.applicationKey!,
      config.allowlistedIPs!,
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
    try {
      let webhookUrl: string;

      if (config.baseUrl) {
        webhookUrl = `${config.baseUrl}/webhook`;
        console.log(`Using custom webhook base URL: ${config.baseUrl}`);
      } else {
        webhookUrl = buildWebhookURL(webhookPort);
      }

      console.log(`Registering webhook URL: ${webhookUrl}`);
      const registered = await webhookManager.registerWebhook(webhookUrl);
      if (registered) {
        console.log("Webhook successfully registered with Ombi");
      } else {
        console.warn(
          "Failed to register webhook with Ombi - notifications may not work",
        );
      }
    } catch (error) {
      console.error("Error setting up webhook:", error);
      console.warn("Continuing without webhook notifications");
    }

    return {
      requestTracker,
      webhookServer,
      webhookManager,
      xmtpNotifier,
    };
  }
}
