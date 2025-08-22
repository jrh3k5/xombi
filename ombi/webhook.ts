import axios from 'axios';

export interface WebhookSettings {
  enabled: boolean;
  webhookUrl: string | null;
  applicationToken: string | null;
  id: number;
}

export class WebhookManager {
  private ombiApiUrl: string;
  private ombiApiKey: string;

  constructor(ombiApiUrl: string, ombiApiKey: string) {
    this.ombiApiUrl = ombiApiUrl;
    this.ombiApiKey = ombiApiKey;
  }

  async getCurrentWebhookSettings(): Promise<WebhookSettings> {
    const response = await axios.get(
      `${this.ombiApiUrl}/api/v1/Settings/notifications/webhook`,
      {
        headers: {
          ApiKey: this.ombiApiKey,
        },
      }
    );
    
    return response.data;
  }

  async registerWebhook(webhookUrl: string, applicationToken?: string): Promise<boolean> {
    try {
      // First, check current settings to avoid unnecessary updates
      const currentSettings = await this.getCurrentWebhookSettings();
      
      // If webhook is already configured with the same URL, don't update
      if (currentSettings.enabled && currentSettings.webhookUrl === webhookUrl) {
        console.log('Webhook already configured with the same URL, skipping registration');
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
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data === true) {
        return true;
      } else {
        console.error('Failed to register webhook, unexpected response:', response.data);
        return false;
      }
    } catch (error) {
      console.error('Error registering webhook with Ombi:', error);
      return false;
    }
  }

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
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data === true) {
        console.log('Webhook successfully unregistered from Ombi');
        return true;
      } else {
        console.error('Failed to unregister webhook, unexpected response:', response.data);
        return false;
      }
    } catch (error) {
      console.error('Error unregistering webhook from Ombi:', error);
      return false;
    }
  }

  async testWebhook(): Promise<boolean> {
    try {
      const currentSettings = await this.getCurrentWebhookSettings();
      
      if (!currentSettings.enabled || !currentSettings.webhookUrl) {
        console.log('No webhook configured to test');
        return false;
      }

      const response = await axios.post(
        `${this.ombiApiUrl}/api/v1/Tester/webhook`,
        {
          enabled: currentSettings.enabled,
          webhookUrl: currentSettings.webhookUrl,
          applicationToken: currentSettings.applicationToken,
        },
        {
          headers: {
            ApiKey: this.ombiApiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Webhook test response:', response.status);
      return response.status === 200;
    } catch (error) {
      console.error('Error testing webhook:', error);
      return false;
    }
  }
}