import axios from "axios";
import { WebhookManager, WebhookSettings } from "./webhook";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("WebhookManager", () => {
  let webhookManager: WebhookManager;
  const mockOmbiApiUrl = "http://localhost:5000";
  const mockOmbiApiKey = "test-api-key";

  beforeEach(() => {
    webhookManager = new WebhookManager(mockOmbiApiUrl, mockOmbiApiKey);
    jest.clearAllMocks();
    // Mock console methods
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with correct API URL and key", () => {
      const manager = new WebhookManager("http://test:3579", "test-key");
      expect(manager).toBeInstanceOf(WebhookManager);
    });
  });

  describe("getCurrentWebhookSettings", () => {
    it("should fetch current webhook settings successfully", async () => {
      const mockSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: "http://192.168.1.100:3000/webhook",
        applicationToken: "test-token",
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockSettings });

      const result = await webhookManager.getCurrentWebhookSettings();

      expect(result).toEqual(mockSettings);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${mockOmbiApiUrl}/api/v1/Settings/notifications/webhook`,
        {
          headers: {
            ApiKey: mockOmbiApiKey,
          },
        },
      );
    });

    it("should handle API error when fetching settings", async () => {
      const mockError = new Error("API Error");
      mockedAxios.get.mockRejectedValue(mockError);

      await expect(webhookManager.getCurrentWebhookSettings()).rejects.toThrow(
        "API Error",
      );
    });
  });

  describe("registerWebhook", () => {
    const mockWebhookUrl = "http://192.168.1.100:3000/webhook";
    const mockApplicationToken = "test-app-token";

    it("should register webhook successfully", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: false,
        webhookUrl: null,
        applicationToken: null,
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: true });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        `Registering webhook with Ombi: ${mockWebhookUrl}`,
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockOmbiApiUrl}/api/v1/Settings/notifications/webhook`,
        {
          enabled: true,
          webhookUrl: mockWebhookUrl,
          applicationToken: mockApplicationToken,
        },
        {
          headers: {
            ApiKey: mockOmbiApiKey,
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should register webhook without application token", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: false,
        webhookUrl: null,
        applicationToken: null,
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: true });

      const result = await webhookManager.registerWebhook(mockWebhookUrl);

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockOmbiApiUrl}/api/v1/Settings/notifications/webhook`,
        {
          enabled: true,
          webhookUrl: mockWebhookUrl,
          applicationToken: null,
        },
        {
          headers: {
            ApiKey: mockOmbiApiKey,
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should skip registration if webhook is already configured with same URL", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: mockWebhookUrl,
        applicationToken: "existing-token",
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        "Webhook already configured with the same URL, skipping registration",
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should update webhook if URL is different", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: "http://old-url:3000/webhook",
        applicationToken: "existing-token",
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: true });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(true);
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it("should return false when API returns non-true response", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: false,
        webhookUrl: null,
        applicationToken: null,
        id: 1,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: false });

      const result = await webhookManager.registerWebhook(mockWebhookUrl);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to register webhook, unexpected response:",
        false,
      );
    });

    it("should handle registration error", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: false,
        webhookUrl: null,
        applicationToken: null,
        id: 1,
      };

      const mockError = new Error("Registration failed");
      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockRejectedValue(mockError);

      const result = await webhookManager.registerWebhook(mockWebhookUrl);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error registering webhook with Ombi:",
        mockError,
      );
    });

    it("should handle error when fetching current settings", async () => {
      const mockError = new Error("Failed to fetch settings");
      mockedAxios.get.mockRejectedValue(mockError);

      const result = await webhookManager.registerWebhook(mockWebhookUrl);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error registering webhook with Ombi:",
        mockError,
      );
    });
  });

  describe("unregisterWebhook", () => {
    it("should unregister webhook successfully", async () => {
      mockedAxios.post.mockResolvedValue({ data: true });

      const result = await webhookManager.unregisterWebhook();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        "Webhook successfully unregistered from Ombi",
      );
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockOmbiApiUrl}/api/v1/Settings/notifications/webhook`,
        {
          enabled: false,
          webhookUrl: null,
          applicationToken: null,
        },
        {
          headers: {
            ApiKey: mockOmbiApiKey,
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should return false when API returns non-true response", async () => {
      mockedAxios.post.mockResolvedValue({ data: false });

      const result = await webhookManager.unregisterWebhook();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Failed to unregister webhook, unexpected response:",
        false,
      );
    });

    it("should handle unregistration error", async () => {
      const mockError = new Error("Unregistration failed");
      mockedAxios.post.mockRejectedValue(mockError);

      const result = await webhookManager.unregisterWebhook();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error unregistering webhook from Ombi:",
        mockError,
      );
    });
  });

  describe("testWebhook", () => {
    const mockSettings: WebhookSettings = {
      enabled: true,
      webhookUrl: "http://192.168.1.100:3000/webhook",
      applicationToken: "test-token",
      id: 1,
    };

    it("should test webhook successfully", async () => {
      mockedAxios.get.mockResolvedValue({ data: mockSettings });
      mockedAxios.post.mockResolvedValue({ status: 200 });

      const result = await webhookManager.testWebhook();

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith("Webhook test response:", 200);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockOmbiApiUrl}/api/v1/Tester/webhook`,
        {
          enabled: mockSettings.enabled,
          webhookUrl: mockSettings.webhookUrl,
          applicationToken: mockSettings.applicationToken,
        },
        {
          headers: {
            ApiKey: mockOmbiApiKey,
            "Content-Type": "application/json",
          },
        },
      );
    });

    it("should return false when webhook is not enabled", async () => {
      const disabledSettings: WebhookSettings = {
        ...mockSettings,
        enabled: false,
      };

      mockedAxios.get.mockResolvedValue({ data: disabledSettings });

      const result = await webhookManager.testWebhook();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith("No webhook configured to test");
      expect(mockedAxios.post).toHaveBeenCalledTimes(0); // Should not call test endpoint
    });

    it("should return false when webhook URL is null", async () => {
      const settingsWithoutUrl: WebhookSettings = {
        ...mockSettings,
        webhookUrl: null,
      };

      mockedAxios.get.mockResolvedValue({ data: settingsWithoutUrl });

      const result = await webhookManager.testWebhook();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith("No webhook configured to test");
      expect(mockedAxios.post).toHaveBeenCalledTimes(0); // Should not call test endpoint
    });

    it("should return false for non-200 response", async () => {
      mockedAxios.get.mockResolvedValue({ data: mockSettings });
      mockedAxios.post.mockResolvedValue({ status: 500 });

      const result = await webhookManager.testWebhook();

      expect(result).toBe(false);
      expect(console.log).toHaveBeenCalledWith("Webhook test response:", 500);
    });

    it("should handle test error", async () => {
      const mockError = new Error("Test failed");
      mockedAxios.get.mockResolvedValue({ data: mockSettings });
      mockedAxios.post.mockRejectedValue(mockError);

      const result = await webhookManager.testWebhook();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error testing webhook:",
        mockError,
      );
    });

    it("should handle error when fetching settings for test", async () => {
      const mockError = new Error("Failed to fetch settings");
      mockedAxios.get.mockRejectedValue(mockError);

      const result = await webhookManager.testWebhook();

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error testing webhook:",
        mockError,
      );
    });
  });
});
