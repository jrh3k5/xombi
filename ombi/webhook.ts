import axios from "axios";

/**
 * The settings that dictate how the webhook endpoint should behave.
 */
export interface WebhookSettings {
  /**
   * Determines if the webhook is enabled or disabled.
   */
  enabled: boolean;
  /**
   * The URL of the webhook; should only be null if the webhook is not enabled.
   */
  webhookUrl: string | null;
  /**
   * The token identifying this application to Ombi; should only be null if the webhook is not enabled.
   */
  applicationToken: string | null;
}

/**
 * A manager that can be used to manage the state of the webhook registration within Ombi.
 */
export class WebhookManager {
  private ombiApiUrl: string;
  private ombiApiKey: string;

  constructor(ombiApiUrl: string, ombiApiKey: string) {
    this.ombiApiUrl = ombiApiUrl;
    this.ombiApiKey = ombiApiKey;
  }

  /**
   * Gets the current webhook settings as they are registered within Ombi.
   * @returns The webhook settings.
   */
  async getCurrentWebhookSettings(): Promise<WebhookSettings> {
    const response = await axios.get(
      `${this.ombiApiUrl}/api/v1/Settings/notifications/webhook`,
      {
        headers: {
          ApiKey: this.ombiApiKey,
        },
      },
    );

    return response.data;
  }

  /**
   * Registers a webhook with Ombi.
   * @param webhookUrl The URL to be invoked by Ombi to interact with this agent.
   * @param applicationToken The token identifying this agent to Ombi.
   * @returns true if the registration succeeded; false if not.
   */
  async registerWebhook(
    webhookUrl: string,
    applicationToken?: string,
  ): Promise<boolean> {
    try {
      // First, check current settings to avoid unnecessary updates
      const currentSettings = await this.getCurrentWebhookSettings();

      // If webhook is already configured with the same URL, don't update
      if (
        currentSettings.enabled &&
        currentSettings.webhookUrl === webhookUrl
      ) {
        console.log(
          "Webhook already configured with the same URL, skipping registration",
        );
        return true;
      }

      const webhookSettings: Partial<WebhookSettings> = {
        enabled: true,
        webhookUrl: webhookUrl,
        applicationToken: applicationToken || null,
      };

      console.log(`Registering webhook with Ombi: ${webhookUrl}`);

      const response = await axios.post(
        `${this.ombiApiUrl}/api/v1/Settings/notifications/webhook`,
        webhookSettings,
        {
          headers: {
            ApiKey: this.ombiApiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data === true) {
        return true;
      } else {
        console.error(
          "Failed to register webhook, unexpected response:",
          response.data,
        );
        return false;
      }
    } catch (error) {
      console.error("Error registering webhook with Ombi:", error);
      return false;
    }
  }

  /**
   * Un-registers this agent's webhook from Ombi.
   * @returns true if the un-registration succeeded; false if not.
   */
  async unregisterWebhook(): Promise<boolean> {
    try {
      const webhookSettings: Partial<WebhookSettings> = {
        enabled: false,
        webhookUrl: null,
        applicationToken: null,
      };

      const response = await axios.post(
        `${this.ombiApiUrl}/api/v1/Settings/notifications/webhook`,
        webhookSettings,
        {
          headers: {
            ApiKey: this.ombiApiKey,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data === true) {
        console.log("Webhook successfully unregistered from Ombi");
        return true;
      } else {
        console.error(
          "Failed to unregister webhook, unexpected response:",
          response.data,
        );
        return false;
      }
    } catch (error) {
      console.error("Error unregistering webhook from Ombi:", error);
      return false;
    }
  }
}
