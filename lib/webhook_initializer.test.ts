import { WebhookInitializer, WebhookConfig } from "./webhook_initializer";
import { Client } from "@xmtp/node-sdk";

// Mock dependencies
jest.mock("../webhook/server", () => ({
  WebhookServer: jest.fn().mockImplementation(() => ({
    setNotificationHandler: jest.fn(),
    start: jest.fn(),
  })),
}));

jest.mock("../state/request_tracker", () => ({
  MemoryRequestTracker: jest.fn(),
}));

jest.mock("../webhook/notify", () => ({
  XMTPNotifier: jest.fn().mockImplementation(() => ({
    sendNotification: jest.fn(),
  })),
}));

jest.mock("../ombi/webhook", () => ({
  WebhookManager: jest.fn().mockImplementation(() => ({
    registerWebhook: jest.fn(),
  })),
}));

jest.mock("./network", () => ({
  buildWebhookURL: jest
    .fn()
    .mockReturnValue("http://192.168.1.100:3000/webhook"),
}));

describe("WebhookInitializer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.OMBI_XOMBI_WEBHOOK_ENABLED;
    delete process.env.OMBI_XOMBI_APPLICATION_KEY;
    delete process.env.OMBI_XOMBI_WEBHOOK_BASE_URL;
    delete process.env.OMBI_XOMBI_WEBHOOK_ALLOWLISTED_IPS;
    delete process.env.OMBI_XOMBI_WEBHOOK_PORT;
    delete process.env.OMBI_API_URL;
    delete process.env.OMBI_API_KEY;
  });

  describe("parseEnvironmentConfig", () => {
    it("should return disabled config when webhooks not enabled", () => {
      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config).toEqual({ enabled: false });
    });

    it("should parse full webhook configuration", () => {
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED = "true";
      process.env.OMBI_XOMBI_APPLICATION_KEY = "test-key";
      process.env.OMBI_XOMBI_WEBHOOK_BASE_URL = "http://custom-url:3000";
      process.env.OMBI_XOMBI_WEBHOOK_ALLOWLISTED_IPS = "192.168.1.1,10.0.0.1";
      process.env.OMBI_XOMBI_WEBHOOK_PORT = "8080";
      process.env.OMBI_API_URL = "http://ombi:3579";
      process.env.OMBI_API_KEY = "ombi-key";

      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config).toEqual({
        enabled: true,
        applicationKey: "test-key",
        baseUrl: "http://custom-url:3000",
        allowlistedIPs: ["192.168.1.1", "10.0.0.1"],
        ombiApiUrl: "http://ombi:3579",
        ombiApiKey: "ombi-key",
        port: 8080,
        debugEnabled: false,
      });
    });

    it("should use defaults when optional values not provided", () => {
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED = "true";
      process.env.OMBI_XOMBI_APPLICATION_KEY = "test-key";
      process.env.OMBI_API_KEY = "ombi-key";

      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config.ombiApiUrl).toBe("http://localhost:5000");
      expect(config.allowlistedIPs).toEqual([
        "127.0.0.1",
        "::1",
        "::ffff:127.0.0.1",
      ]);
      expect(config.port).toBe(3000);
      expect(config.debugEnabled).toBe(false);
    });

    it("should parse custom webhook port", () => {
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED = "true";
      process.env.OMBI_XOMBI_APPLICATION_KEY = "test-key";
      process.env.OMBI_API_KEY = "ombi-key";
      process.env.OMBI_XOMBI_WEBHOOK_PORT = "8080";

      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config.port).toBe(8080);
    });

    it("should handle invalid port number gracefully", () => {
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED = "true";
      process.env.OMBI_XOMBI_APPLICATION_KEY = "test-key";
      process.env.OMBI_API_KEY = "ombi-key";
      process.env.OMBI_XOMBI_WEBHOOK_PORT = "invalid";

      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config.port).toBe(3000); // Should default to 3000 for invalid port
    });

    it("should parse debug configuration", () => {
      process.env.OMBI_XOMBI_WEBHOOK_ENABLED = "true";
      process.env.OMBI_XOMBI_APPLICATION_KEY = "test-key";
      process.env.OMBI_API_KEY = "ombi-key";
      process.env.DEBUG_OMBI_WEBHOOK = "true";

      const config = WebhookInitializer.parseEnvironmentConfig();

      expect(config.debugEnabled).toBe(true);
    });
  });

  describe("validateConfig", () => {
    it("should not validate disabled config", () => {
      const config: WebhookConfig = { enabled: false };

      expect(() => WebhookInitializer.validateConfig(config)).not.toThrow();
    });

    it("should throw error for missing application key", () => {
      const config: WebhookConfig = {
        enabled: true,
        ombiApiKey: "test-key",
      };

      expect(() => WebhookInitializer.validateConfig(config)).toThrow(
        "OMBI_XOMBI_APPLICATION_KEY environment variable is required when webhooks are enabled",
      );
    });

    it("should throw error for missing ombi API key", () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
      };

      expect(() => WebhookInitializer.validateConfig(config)).toThrow(
        "OMBI_API_KEY environment variable is required",
      );
    });

    it("should pass validation for complete config", () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
        ombiApiKey: "ombi-key",
        ombiApiUrl: "http://ombi:3579",
        allowlistedIPs: ["127.0.0.1"],
      };

      expect(() => WebhookInitializer.validateConfig(config)).not.toThrow();
    });
  });

  describe("initializeWebhookSystem", () => {
    const mockXmtpClient = { id: "mock-client" };

    it("should return null for disabled webhooks", async () => {
      const config: WebhookConfig = { enabled: false };

      const result = await WebhookInitializer.initializeWebhookSystem(
        config,
        mockXmtpClient as unknown as Client,
      );

      expect(result).toBeNull();
    });

    it("should initialize webhook system successfully", async () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
        ombiApiKey: "ombi-key",
        ombiApiUrl: "http://ombi:3579",
        allowlistedIPs: ["127.0.0.1"],
      };

      const mockWebhookServer = {
        setNotificationHandler: jest.fn(),
        start: jest.fn().mockResolvedValue(undefined),
      };
      const mockWebhookManager = {
        registerWebhook: jest.fn().mockResolvedValue(true),
      };

      jest
        .requireMock("../webhook/server")
        .WebhookServer.mockReturnValue(mockWebhookServer);
      jest
        .requireMock("../ombi/webhook")
        .WebhookManager.mockReturnValue(mockWebhookManager);

      const result = await WebhookInitializer.initializeWebhookSystem(
        config,
        mockXmtpClient as unknown as Client,
      );

      expect(result).not.toBeNull();
      expect(result!.requestTracker).toBeDefined();
      expect(result!.webhookServer).toBe(mockWebhookServer);
      expect(result!.webhookManager).toBe(mockWebhookManager);
      expect(result!.xmtpNotifier).toBeDefined();

      expect(mockWebhookServer.start).toHaveBeenCalledWith(3000);
      expect(mockWebhookManager.registerWebhook).toHaveBeenCalledWith(
        "http://192.168.1.100:3000/webhook",
        "test-key",
      );
    });

    it("should use custom base URL when provided", async () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
        baseUrl: "http://custom:3000",
        ombiApiKey: "ombi-key",
        ombiApiUrl: "http://ombi:3579",
        allowlistedIPs: ["127.0.0.1"],
      };

      const mockWebhookServer = {
        setNotificationHandler: jest.fn(),
        start: jest.fn().mockResolvedValue(undefined),
      };
      const mockWebhookManager = {
        registerWebhook: jest.fn().mockResolvedValue(true),
      };

      jest
        .requireMock("../webhook/server")
        .WebhookServer.mockReturnValue(mockWebhookServer);
      jest
        .requireMock("../ombi/webhook")
        .WebhookManager.mockReturnValue(mockWebhookManager);

      await WebhookInitializer.initializeWebhookSystem(
        config,
        mockXmtpClient as unknown as Client,
      );

      expect(mockWebhookManager.registerWebhook).toHaveBeenCalledWith(
        "http://custom:3000/webhook",
        "test-key",
      );
    });

    it("should use custom port when provided", async () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
        ombiApiKey: "ombi-key",
        ombiApiUrl: "http://ombi:3579",
        allowlistedIPs: ["127.0.0.1"],
        port: 8080,
      };

      const mockWebhookServer = {
        setNotificationHandler: jest.fn(),
        start: jest.fn().mockResolvedValue(undefined),
      };
      const mockWebhookManager = {
        registerWebhook: jest.fn().mockResolvedValue(true),
      };

      jest
        .requireMock("../webhook/server")
        .WebhookServer.mockReturnValue(mockWebhookServer);
      jest
        .requireMock("../ombi/webhook")
        .WebhookManager.mockReturnValue(mockWebhookManager);

      await WebhookInitializer.initializeWebhookSystem(
        config,
        mockXmtpClient as unknown as Client,
      );

      expect(mockWebhookServer.start).toHaveBeenCalledWith(8080);
    });

    it("should handle webhook registration failure gracefully", async () => {
      const config: WebhookConfig = {
        enabled: true,
        applicationKey: "test-key",
        ombiApiKey: "ombi-key",
        ombiApiUrl: "http://ombi:3579",
        allowlistedIPs: ["127.0.0.1"],
      };

      const mockWebhookServer = {
        setNotificationHandler: jest.fn(),
        start: jest.fn().mockResolvedValue(undefined),
      };
      const mockWebhookManager = {
        registerWebhook: jest
          .fn()
          .mockRejectedValue(new Error("Registration failed")),
      };

      jest
        .requireMock("../webhook/server")
        .WebhookServer.mockReturnValue(mockWebhookServer);
      jest
        .requireMock("../ombi/webhook")
        .WebhookManager.mockReturnValue(mockWebhookManager);

      await expect(
        WebhookInitializer.initializeWebhookSystem(
          config,
          mockXmtpClient as unknown as Client,
        ),
      ).rejects.toThrow("Registration failed");
    });
  });
});
