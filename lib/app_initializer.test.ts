import { AppInitializer } from "./app_initializer.js";

// Mock dependencies
jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("@xmtp/agent-sdk");

jest.mock("./eoa.js", () => ({
  convertEOAToSigner: jest.fn().mockReturnValue({ type: "mock-signer" }),
}));

jest.mock("viem/accounts", () => ({
  privateKeyToAccount: jest.fn().mockReturnValue({ address: "0xmockaddress" }),
}));

jest.mock("viem/chains", () => ({
  mainnet: { id: 1 },
  sepolia: { id: 11155111 },
}));

jest.mock("viem", () => ({
  toBytes: jest.fn().mockReturnValue(new Uint8Array()),
}));

jest.mock("../ombi/client.js", () => ({
  newClient: jest.fn().mockReturnValue({ id: "mock-ombi-client" }),
}));

jest.mock("./xmtp_config.js", () => ({
  parseEnvironmentConfig: jest.fn(),
}));

jest.mock("./webhook_initializer.js", () => ({
  WebhookInitializer: {
    parseEnvironmentConfig: jest.fn().mockReturnValue({ enabled: false }),
    initializeWebhookSystem: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock("../media/triage", () => ({
  triageCurrentStep: jest.fn(),
}));

jest.mock("./conversation_member.js", () => ({
  getEthereumAddressesOfMember: jest.fn(),
}));

describe("AppInitializer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.ALLOW_LIST;

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
    jest.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("parseAppConfig", () => {
    it("should return empty array when no ALLOW_LIST provided", () => {
      const config = AppInitializer.parseAppConfig();

      expect(config.allowedAddresses).toEqual([]);
    });

    it("should parse comma-separated allowed addresses", () => {
      process.env.ALLOW_LIST =
        "0x1234567890ABCDEF,0xFEDCBA0987654321, 0xABCD1234";

      const config = AppInitializer.parseAppConfig();

      expect(config.allowedAddresses).toEqual([
        "0x1234567890abcdef",
        "0xfedcba0987654321",
        "0xabcd1234",
      ]);
    });

    it("should trim and lowercase addresses", () => {
      process.env.ALLOW_LIST = " 0X1234 , 0XABCD ";

      const config = AppInitializer.parseAppConfig();

      expect(config.allowedAddresses).toEqual(["0x1234", "0xabcd"]);
    });
  });

  describe("initialize", () => {
    it("should initialize successfully with webhooks disabled", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { parseEnvironmentConfig } = jest.requireMock("./xmtp_config.js");
      const { WebhookInitializer } = jest.requireMock(
        "./webhook_initializer.js",
      );

      parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });
      // Agent.create is already mocked in the __mocks__ file

      // Mock the message processing setup to avoid infinite loop
      jest
        .spyOn(AppInitializer, "setupMessageHandler")
        .mockImplementation(() => {
          // Do nothing, just return
        });

      await AppInitializer.initialize();

      expect(jest.requireMock("dotenv").config).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith("xombi starting");
      expect(console.log).toHaveBeenCalledWith(
        "Allowing messages from addresses:",
        ["0x1234"],
      );
      expect(console.log).toHaveBeenCalledWith(
        "Agent initialized on 0xmockaddress\nSend a message on http://xmtp.chat/dm/0xmockaddress?env=dev",
      );

      expect(WebhookInitializer.parseEnvironmentConfig).toHaveBeenCalled();
      expect(WebhookInitializer.initializeWebhookSystem).toHaveBeenCalledWith(
        { enabled: false },
        { id: "mock-agent-client" },
      );
    });

    it("should rethrow unknown errors", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { parseEnvironmentConfig } = jest.requireMock("./xmtp_config.js");

      parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });

      const unknownError = new Error("Unknown error");
      // Mock Agent.create to reject with the unknown error
      const { Agent } = jest.requireMock("@xmtp/agent-sdk");
      Agent.create.mockRejectedValue(unknownError);

      await expect(AppInitializer.initialize()).rejects.toThrow(
        "Unknown error",
      );
    });
  });

  describe("setupMessageHandler", () => {
    it("should be a function that handles message processing", () => {
      expect(typeof AppInitializer.setupMessageHandler).toBe("function");
    });
  });
});
