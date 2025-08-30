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
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: true });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(true);
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

    it("should skip registration if webhook is already configured with same URL and application token", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: mockWebhookUrl,
        applicationToken: mockApplicationToken,
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(true);
      expect(console.log).toHaveBeenCalledWith(
        "Webhook already configured with the same URL and application token, skipping registration",
      );
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it("should update webhook if URL is different", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: "http://old-url:3000/webhook",
        applicationToken: mockApplicationToken,
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

    it("should update webhook if application token is different", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: mockWebhookUrl,
        applicationToken: "old-application-token",
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

    it("should update webhook if both URL and application token are different", async () => {
      const mockCurrentSettings: WebhookSettings = {
        enabled: true,
        webhookUrl: "http://old-url:3000/webhook",
        applicationToken: "old-application-token",
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
      };

      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockResolvedValue({ data: false });

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

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
      };

      const mockError = new Error("Registration failed");
      mockedAxios.get.mockResolvedValue({ data: mockCurrentSettings });
      mockedAxios.post.mockRejectedValue(mockError);

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error registering webhook with Ombi:",
        mockError,
      );
    });

    it("should handle error when fetching current settings", async () => {
      const mockError = new Error("Failed to fetch settings");
      mockedAxios.get.mockRejectedValue(mockError);

      const result = await webhookManager.registerWebhook(
        mockWebhookUrl,
        mockApplicationToken,
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        "Error registering webhook with Ombi:",
        mockError,
      );
    });
  });
});
