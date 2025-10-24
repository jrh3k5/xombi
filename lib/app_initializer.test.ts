import { AppInitializer } from "./app_initializer.js";
import {
  XMTPInstallationLimitError,
  XMTPClientCreationError,
} from "./xmtp_client_factory.js";
import { UnresolvableAddressError } from "../ombi/errors.js";
import { XmtpEnv, Client } from "@xmtp/node-sdk";
import { OmbiClient } from "../ombi/client.js";

// Mock dependencies
jest.mock("dotenv", () => ({
  config: jest.fn(),
}));

jest.mock("../ombi/client.js", () => ({
  newClient: jest.fn().mockReturnValue({ id: "mock-ombi-client" }),
}));

jest.mock("./xmtp_client_factory.js", () => ({
  XMTPClientFactory: {
    parseEnvironmentConfig: jest.fn(),
    createClient: jest.fn(),
  },
  XMTPInstallationLimitError: class extends Error {
    constructor(
      message: string,
      public autoRevokeAvailable: boolean,
    ) {
      super(message);
      this.name = "XMTPInstallationLimitError";
    }
    getResolutionSteps() {
      return ["step1", "step2", "step3"];
    }
  },
  XMTPClientCreationError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = "XMTPClientCreationError";
    }
  },
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
    const mockXmtpResult = {
      client: { id: "mock-xmtp-client" },
      account: { address: "0xmockaddress" },
      environment: "dev" as XmtpEnv,
    };

    it("should initialize successfully with webhooks disabled", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { XMTPClientFactory } = jest.requireMock(
        "./xmtp_client_factory.js",
      );
      const { WebhookInitializer } = jest.requireMock(
        "./webhook_initializer.js",
      );

      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });
      XMTPClientFactory.createClient.mockResolvedValue(mockXmtpResult);

      // Mock the message processing loop to avoid infinite loop
      jest
        .spyOn(AppInitializer, "startMessageProcessingLoop")
        .mockImplementation(async () => {
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
        `Agent initialized on ${mockXmtpResult.account.address}\nSend a message on http://xmtp.chat/dm/${mockXmtpResult.account.address}?env=${mockXmtpResult.environment}`,
      );

      expect(WebhookInitializer.parseEnvironmentConfig).toHaveBeenCalled();
      expect(WebhookInitializer.initializeWebhookSystem).toHaveBeenCalledWith(
        { enabled: false },
        mockXmtpResult.client,
      );
    });

    it("should handle XMTP installation limit error gracefully", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { XMTPClientFactory } = jest.requireMock(
        "./xmtp_client_factory.js",
      );

      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });

      const installationError = new XMTPInstallationLimitError(
        "Installation limit reached",
        true,
      );
      XMTPClientFactory.createClient.mockRejectedValue(installationError);

      await expect(AppInitializer.initialize()).rejects.toThrow(
        "process.exit called",
      );

      expect(console.error).toHaveBeenCalledWith(
        "\n❌ XMTP Installation Limit Error",
      );
      expect(console.error).toHaveBeenCalledWith(
        "Your XMTP identity has reached the maximum number of installations.",
      );
      expect(console.error).toHaveBeenCalledWith(
        "\nTo resolve this issue, you can:",
      );
      expect(console.error).toHaveBeenCalledWith("step1");
      expect(console.error).toHaveBeenCalledWith("step2");
      expect(console.error).toHaveBeenCalledWith("step3");
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it("should handle XMTP client creation error", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { XMTPClientFactory } = jest.requireMock(
        "./xmtp_client_factory.js",
      );

      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });

      const creationError = new XMTPClientCreationError(
        "Client creation failed",
      );
      XMTPClientFactory.createClient.mockRejectedValue(creationError);

      await expect(AppInitializer.initialize()).rejects.toThrow(
        XMTPClientCreationError,
      );

      expect(console.error).toHaveBeenCalledWith(
        "XMTP client creation failed:",
        "Client creation failed",
      );
    });

    it("should rethrow unknown errors", async () => {
      process.env.ALLOW_LIST = "0x1234";

      const { XMTPClientFactory } = jest.requireMock(
        "./xmtp_client_factory.js",
      );

      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: "0xsigner",
        encryptionKey: "0xencryption",
        environment: "dev",
      });

      const unknownError = new Error("Unknown error");
      XMTPClientFactory.createClient.mockRejectedValue(unknownError);

      await expect(AppInitializer.initialize()).rejects.toThrow(
        "Unknown error",
      );
    });
  });

  describe("sendAdminAnnouncements", () => {
    let mockXmtpClient: {
      inboxId: string;
      conversations: {
        list: jest.Mock;
        newDm: jest.Mock;
      };
      getInboxIdByIdentifier: jest.Mock;
    };
    let mockConversation: {
      send: jest.Mock;
      members: jest.Mock;
    };

    beforeEach(() => {
      jest.spyOn(console, "debug").mockImplementation();

      mockConversation = {
        send: jest.fn().mockResolvedValue(undefined),
        members: jest.fn(),
      };

      mockXmtpClient = {
        inboxId: "bot-inbox-id",
        conversations: {
          list: jest.fn().mockResolvedValue([]),
          newDm: jest.fn(),
        },
        getInboxIdByIdentifier: jest.fn(),
      };
    });

    it("should return early when no admin addresses provided", async () => {
      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [],
      );

      expect(mockXmtpClient.conversations.list).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it("should send announcement to existing 1-on-1 conversation", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      const adminAddress = "0xadmin123";
      const botMember = { inboxId: "bot-inbox-id" };
      const adminMember = { inboxId: "admin-inbox-id" };

      mockConversation.members.mockResolvedValue([botMember, adminMember]);
      mockXmtpClient.conversations.list.mockResolvedValue([mockConversation]);
      getEthereumAddressesOfMember.mockReturnValue([adminAddress]);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(mockConversation.send).toHaveBeenCalledWith(
        "🤖 xombi is now online and ready!",
      );
      expect(console.log).toHaveBeenCalledWith(
        `Startup announcement sent to admin: ${adminAddress}`,
      );
      expect(mockXmtpClient.conversations.newDm).not.toHaveBeenCalled();
    });

    it("should skip conversations with more than 2 members", async () => {
      const adminAddress = "0xadmin123";
      const botMember = { inboxId: "bot-inbox-id" };
      const adminMember = { inboxId: "admin-inbox-id" };
      const extraMember = { inboxId: "extra-inbox-id" };

      mockConversation.members.mockResolvedValue([
        botMember,
        adminMember,
        extraMember,
      ]);
      mockXmtpClient.conversations.list.mockResolvedValue([mockConversation]);
      mockXmtpClient.getInboxIdByIdentifier.mockResolvedValue("admin-inbox-id");
      mockXmtpClient.conversations.newDm.mockResolvedValue(mockConversation);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining("has 3 members"),
      );
      expect(mockXmtpClient.conversations.newDm).toHaveBeenCalled();
    });

    it("should create new conversation when none exists", async () => {
      const adminAddress = "0xadmin123";

      mockXmtpClient.conversations.list.mockResolvedValue([]);
      mockXmtpClient.getInboxIdByIdentifier.mockResolvedValue("admin-inbox-id");
      mockXmtpClient.conversations.newDm.mockResolvedValue(mockConversation);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(mockXmtpClient.getInboxIdByIdentifier).toHaveBeenCalledWith({
        identifier: adminAddress,
        identifierKind: expect.anything(),
      });
      expect(mockXmtpClient.conversations.newDm).toHaveBeenCalledWith(
        "admin-inbox-id",
      );
      expect(mockConversation.send).toHaveBeenCalledWith(
        "🤖 xombi is now online and ready!",
      );
      expect(console.log).toHaveBeenCalledWith(
        `New conversation created with admin: ${adminAddress}`,
      );
      expect(console.log).toHaveBeenCalledWith(
        `Startup announcement sent to admin: ${adminAddress}`,
      );
    });

    it("should handle inbox ID not found", async () => {
      const adminAddress = "0xadmin123";

      mockXmtpClient.conversations.list.mockResolvedValue([]);
      mockXmtpClient.getInboxIdByIdentifier.mockResolvedValue(null);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(console.error).toHaveBeenCalledWith(
        `Could not find inbox ID for admin ${adminAddress}. The address may not be registered on XMTP.`,
      );
      expect(mockXmtpClient.conversations.newDm).not.toHaveBeenCalled();
      expect(mockConversation.send).not.toHaveBeenCalled();
    });

    it("should handle error when creating new conversation", async () => {
      const adminAddress = "0xadmin123";
      const error = new Error("Failed to create DM");

      mockXmtpClient.conversations.list.mockResolvedValue([]);
      mockXmtpClient.getInboxIdByIdentifier.mockResolvedValue("admin-inbox-id");
      mockXmtpClient.conversations.newDm.mockRejectedValue(error);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(console.error).toHaveBeenCalledWith(
        `Failed to create conversation with admin ${adminAddress}:`,
        error,
      );
      expect(mockConversation.send).not.toHaveBeenCalled();
    });

    it("should handle error when sending message", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      const adminAddress = "0xadmin123";
      const error = new Error("Failed to send message");
      const botMember = { inboxId: "bot-inbox-id" };
      const adminMember = { inboxId: "admin-inbox-id" };

      mockConversation.members.mockResolvedValue([botMember, adminMember]);
      mockConversation.send.mockRejectedValue(error);
      mockXmtpClient.conversations.list.mockResolvedValue([mockConversation]);
      getEthereumAddressesOfMember.mockReturnValue([adminAddress]);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(console.error).toHaveBeenCalledWith(
        `Failed to send startup announcement to admin ${adminAddress}:`,
        error,
      );
    });

    it("should process multiple admin addresses", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      const adminAddress1 = "0xadmin123";
      const adminAddress2 = "0xadmin456";

      const botMember = { inboxId: "bot-inbox-id" };
      const adminMember1 = { inboxId: "admin-inbox-id-1" };
      const adminMember2 = { inboxId: "admin-inbox-id-2" };

      const mockConversation1 = {
        send: jest.fn().mockResolvedValue(undefined),
        members: jest.fn().mockResolvedValue([botMember, adminMember1]),
      };

      const mockConversation2 = {
        send: jest.fn().mockResolvedValue(undefined),
        members: jest.fn().mockResolvedValue([botMember, adminMember2]),
      };

      mockXmtpClient.conversations.list.mockResolvedValue([
        mockConversation1,
        mockConversation2,
      ]);

      // Mock returns for each admin address search
      // Note: getEthereumAddressesOfMember is only called for non-bot members
      // For adminAddress1: check adminMember1 (match)
      // For adminAddress2: check adminMember1 (no match), check adminMember2 (match)
      getEthereumAddressesOfMember
        .mockReturnValueOnce([adminAddress1]) // adminAddress1 iteration, adminMember1
        .mockReturnValueOnce([adminAddress1]) // adminAddress2 iteration, mockConversation1 adminMember1 (doesn't match adminAddress2)
        .mockReturnValueOnce([adminAddress2]); // adminAddress2 iteration, mockConversation2 adminMember2 (matches)

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress1, adminAddress2],
      );

      expect(mockConversation1.send).toHaveBeenCalledWith(
        "🤖 xombi is now online and ready!",
      );
      expect(mockConversation2.send).toHaveBeenCalledWith(
        "🤖 xombi is now online and ready!",
      );
      expect(console.log).toHaveBeenCalledWith(
        `Startup announcement sent to admin: ${adminAddress1}`,
      );
      expect(console.log).toHaveBeenCalledWith(
        `Startup announcement sent to admin: ${adminAddress2}`,
      );
    });

    it("should skip conversation without send method", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      const adminAddress = "0xadmin123";
      const botMember = { inboxId: "bot-inbox-id" };
      const adminMember = { inboxId: "admin-inbox-id" };

      const conversationWithoutSend = {
        members: jest.fn().mockResolvedValue([botMember, adminMember]),
        // No send method
      };

      mockXmtpClient.conversations.list.mockResolvedValue([
        conversationWithoutSend,
      ]);
      mockXmtpClient.getInboxIdByIdentifier.mockResolvedValue("admin-inbox-id");
      mockXmtpClient.conversations.newDm.mockResolvedValue(mockConversation);

      // getEthereumAddressesOfMember is only called for non-bot members (adminMember)
      getEthereumAddressesOfMember.mockReturnValueOnce([adminAddress]);

      await AppInitializer.sendAdminAnnouncements(
        mockXmtpClient as unknown as Client,
        [adminAddress],
      );

      expect(console.debug).toHaveBeenCalledWith(
        expect.stringContaining("lacks a 'send' member"),
      );
      expect(mockXmtpClient.conversations.newDm).toHaveBeenCalled();
    });
  });

  describe("startMessageProcessingLoop", () => {
    const mockXmtpClient = {
      inboxId: "agent-inbox-id",
      conversations: {
        streamAllMessages: jest.fn(),
        getDmByInboxId: jest.fn(),
      },
    };

    const mockConversation = {
      send: jest.fn(),
      members: jest.fn(),
    };

    const mockMessage = {
      senderInboxId: "sender-inbox-id",
      contentType: { typeId: "text" },
      content: "test message",
    };

    const mockMember = {
      inboxId: "sender-inbox-id",
    };

    const allowedAddresses = ["0x1234567890abcdef"];
    const ombiClient = { id: "mock-ombi-client" };

    beforeEach(() => {
      mockXmtpClient.conversations.streamAllMessages.mockResolvedValue([]);
      mockXmtpClient.conversations.getDmByInboxId.mockReturnValue(
        mockConversation,
      );
      mockConversation.members.mockResolvedValue([mockMember]);
      mockConversation.send.mockResolvedValue(undefined);
    });

    it("should handle UnresolvableAddressError with user-friendly message", async () => {
      const { triageCurrentStep } = jest.requireMock("../media/triage.js");
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      // Setup mocks
      const errorMessage = new UnresolvableAddressError(
        "0x123" as `0x${string}`,
      );
      triageCurrentStep.mockRejectedValue(errorMessage);
      getEthereumAddressesOfMember.mockReturnValue(["0x1234567890abcdef"]);

      // Mock the message stream to return one message then complete
      const messageStream = [mockMessage];
      mockXmtpClient.conversations.streamAllMessages.mockImplementation(
        async function* () {
          yield* messageStream;
        },
      );

      // Create a promise that resolves when we've processed the message
      let messageProcessed = false;
      mockConversation.send.mockImplementation(async () => {
        messageProcessed = true;
        return Promise.resolve();
      });

      // Start the processing loop with a timeout to prevent infinite waiting
      AppInitializer.startMessageProcessingLoop(
        mockXmtpClient as unknown as Client,
        allowedAddresses,
        ombiClient as unknown as OmbiClient,
      );

      // Wait for the message to be processed
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (messageProcessed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 10);
      });

      // Verify the error handling behavior
      expect(mockConversation.send).toHaveBeenCalledWith(
        "There is a user mapping configuration issue. Please contact xombi's administrator for more help.\n\nUntil this is resolved, you will not be able to use xombi.",
      );
    });

    it("should handle generic errors with fallback message", async () => {
      const { triageCurrentStep } = jest.requireMock("../media/triage.js");
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "./conversation_member.js",
      );

      // Setup mocks
      const genericError = new Error("Generic error");
      triageCurrentStep.mockRejectedValue(genericError);
      getEthereumAddressesOfMember.mockReturnValue(["0x1234567890abcdef"]);

      // Mock the message stream to return one message then complete
      const messageStream = [mockMessage];
      mockXmtpClient.conversations.streamAllMessages.mockImplementation(
        async function* () {
          yield* messageStream;
        },
      );

      // Create a promise that resolves when we've processed the message
      let messageProcessed = false;
      mockConversation.send.mockImplementation(async () => {
        messageProcessed = true;
        return Promise.resolve();
      });

      // Start the processing loop with a timeout to prevent infinite waiting
      AppInitializer.startMessageProcessingLoop(
        mockXmtpClient as unknown as Client,
        allowedAddresses,
        ombiClient as unknown as OmbiClient,
      );

      // Wait for the message to be processed
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (messageProcessed) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 10);
      });

      // Verify the error handling behavior
      expect(mockConversation.send).toHaveBeenCalledWith(
        "Sorry, I encountered an unexpected error while processing your message.",
      );
    });

    it("should be a function that handles message processing", () => {
      expect(typeof AppInitializer.startMessageProcessingLoop).toBe("function");
    });
  });
});
