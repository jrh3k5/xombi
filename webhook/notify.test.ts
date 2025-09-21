import { XMTPNotifier } from "./notify.js";
import { Client, Dm, GroupMember } from "@xmtp/node-sdk";

// Mock dependencies
jest.mock("../lib/conversation_member.js", () => ({
  getEthereumAddressesOfMember: jest.fn(),
}));

describe("XMTPNotifier", () => {
  let notifier: XMTPNotifier;
  let mockXmtpClient: jest.Mocked<Client>;
  let mockXmtpClientConversationsListFn: jest.Mock;
  let mockConversation: jest.Mocked<Dm>;
  let mockConversationSendFn: jest.Mock;
  let mockMember: GroupMember;

  const testAddress = "0x1234567890abcdef";
  const testMessage = "Test notification message";

  beforeEach(() => {
    mockXmtpClientConversationsListFn = jest.fn();

    // Mock XMTP Client
    mockXmtpClient = {
      conversations: {
        list: mockXmtpClientConversationsListFn,
      },
    } as unknown as jest.Mocked<Client>;

    mockConversationSendFn = jest.fn();

    // Mock Conversation (Dm)
    mockConversation = {
      members: jest.fn(),
      send: mockConversationSendFn,
    } as unknown as jest.Mocked<Dm>;

    // Mock Member
    mockMember = {
      inboxId: "test-inbox-id",
      addresses: [testAddress],
    } as unknown as GroupMember;

    notifier = new XMTPNotifier(mockXmtpClient);

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with XMTP client", () => {
      expect(notifier).toBeInstanceOf(XMTPNotifier);
      expect(notifier.getCachedConversationCount()).toBe(0);
    });
  });

  describe("sendNotification", () => {
    beforeEach(() => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember.mockReturnValue([testAddress]);
    });

    it("should send notification to existing conversation from cache", async () => {
      // Set up cached conversation
      notifier["conversationCache"].set(
        testAddress.toLowerCase(),
        mockConversation,
      );
      mockConversationSendFn.mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockConversation.send).toHaveBeenCalledWith(testMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress}: ${testMessage}`,
      );
      expect(mockXmtpClient.conversations.list).not.toHaveBeenCalled();
    });

    it("should find and cache conversation when not in cache", async () => {
      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([mockMember]);
      mockConversationSendFn.mockResolvedValue(undefined);

      // Add send method to conversation to make it a Dm
      mockConversationSendFn = jest.fn().mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockXmtpClient.conversations.list).toHaveBeenCalled();
      expect(mockConversation.members).toHaveBeenCalled();
      expect(mockConversation.send).toHaveBeenCalledWith(testMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress}: ${testMessage}`,
      );

      // Should be cached now
      expect(notifier.getCachedConversationCount()).toBe(1);
    });

    it("should handle case insensitive address matching", async () => {
      const upperCaseAddress = testAddress.toUpperCase();
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember.mockReturnValue([upperCaseAddress]);

      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([mockMember]);
      mockConversationSendFn.mockResolvedValue(undefined);
      mockConversationSendFn = jest.fn().mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress.toLowerCase(), testMessage);

      expect(mockConversation.send).toHaveBeenCalledWith(testMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress.toLowerCase()}: ${testMessage}`,
      );
    });

    it("should skip conversations without send method (not Dm)", async () => {
      const mockGroupConversation = {
        members: jest.fn().mockResolvedValue([mockMember]),
        // No send method - this would be a Group conversation
      };

      mockXmtpClientConversationsListFn.mockResolvedValue([
        mockGroupConversation,
        mockConversation,
      ]);
      mockConversation.members.mockResolvedValue([mockMember]);
      mockConversationSendFn.mockResolvedValue(undefined);
      mockConversationSendFn = jest.fn().mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockConversation.send).toHaveBeenCalledWith(testMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress}: ${testMessage}`,
      );
    });

    it("should handle multiple members in conversation", async () => {
      const otherMember: GroupMember = {
        inboxId: "other-inbox-id",
        addresses: ["0xother"],
      } as unknown as GroupMember;

      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember
        .mockReturnValueOnce(["0xother"]) // First member
        .mockReturnValueOnce([testAddress]); // Second member (target)

      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([otherMember, mockMember]);
      mockConversationSendFn.mockResolvedValue(undefined);
      mockConversationSendFn = jest.fn().mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockConversation.members).toHaveBeenCalled();
      expect(mockConversation.send).toHaveBeenCalledWith(testMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress}: ${testMessage}`,
      );
    });

    it("should handle no existing conversation found", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember.mockReturnValue(["0xother"]); // Different address

      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([mockMember]);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockXmtpClient.conversations.list).toHaveBeenCalled();
      expect(mockConversation.members).toHaveBeenCalled();
      expect(mockConversation.send).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        `No existing conversation found with ${testAddress}, cannot send notification`,
      );

      // Should not be cached
      expect(notifier.getCachedConversationCount()).toBe(0);
    });

    it("should handle empty conversation list", async () => {
      mockXmtpClientConversationsListFn.mockResolvedValue([]);

      await notifier.sendNotification(testAddress, testMessage);

      expect(mockXmtpClient.conversations.list).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        `No existing conversation found with ${testAddress}, cannot send notification`,
      );
      expect(notifier.getCachedConversationCount()).toBe(0);
    });

    it("should handle conversation.members() error", async () => {
      const membersError = new Error("Failed to get members");
      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockRejectedValue(membersError);

      await expect(
        notifier.sendNotification(testAddress, testMessage),
      ).rejects.toThrow("Failed to get members");

      expect(console.error).toHaveBeenCalledWith(
        `Failed to send notification to ${testAddress}:`,
        membersError,
      );
    });

    it("should handle conversation.send() error", async () => {
      const sendError = new Error("Failed to send message");
      notifier["conversationCache"].set(
        testAddress.toLowerCase(),
        mockConversation,
      );
      mockConversation.send.mockRejectedValue(sendError);

      await expect(
        notifier.sendNotification(testAddress, testMessage),
      ).rejects.toThrow("Failed to send message");

      expect(console.error).toHaveBeenCalledWith(
        `Failed to send notification to ${testAddress}:`,
        sendError,
      );
    });

    it("should handle XMTP client.conversations.list() error", async () => {
      const listError = new Error("Failed to list conversations");
      mockXmtpClientConversationsListFn.mockRejectedValue(listError);

      await expect(
        notifier.sendNotification(testAddress, testMessage),
      ).rejects.toThrow("Failed to list conversations");

      expect(console.error).toHaveBeenCalledWith(
        `Failed to send notification to ${testAddress}:`,
        listError,
      );
    });

    it("should handle getEthereumAddressesOfMember returning empty array", async () => {
      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember.mockReturnValue([]); // No addresses

      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([mockMember]);

      await notifier.sendNotification(testAddress, testMessage);

      expect(console.log).toHaveBeenCalledWith(
        `No existing conversation found with ${testAddress}, cannot send notification`,
      );
    });

    it("should use cached conversation for subsequent calls", async () => {
      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([mockMember]);
      mockConversationSendFn.mockResolvedValue(undefined);
      mockConversationSendFn = jest.fn().mockResolvedValue(undefined);

      // First call - should list conversations
      await notifier.sendNotification(testAddress, testMessage);
      expect(mockXmtpClient.conversations.list).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      await notifier.sendNotification(testAddress, testMessage);
      expect(mockXmtpClient.conversations.list).toHaveBeenCalledTimes(1); // Still 1, not called again
      expect(mockConversation.send).toHaveBeenCalledTimes(2); // Called both times
    });
  });

  describe("clearConversationCache", () => {
    it("should clear the conversation cache", async () => {
      // Add something to cache first
      notifier["conversationCache"].set(
        testAddress.toLowerCase(),
        mockConversation,
      );
      expect(notifier.getCachedConversationCount()).toBe(1);

      notifier.clearConversationCache();

      expect(notifier.getCachedConversationCount()).toBe(0);
    });

    it("should handle empty cache", () => {
      expect(notifier.getCachedConversationCount()).toBe(0);

      notifier.clearConversationCache();

      expect(notifier.getCachedConversationCount()).toBe(0); // Still 0
    });
  });

  describe("getCachedConversationCount", () => {
    it("should return 0 for empty cache", () => {
      expect(notifier.getCachedConversationCount()).toBe(0);
    });

    it("should return correct count after caching conversations", () => {
      notifier["conversationCache"].set("0xaddress1", mockConversation);
      notifier["conversationCache"].set("0xaddress2", mockConversation);

      expect(notifier.getCachedConversationCount()).toBe(2);
    });

    it("should return correct count after clearing cache", () => {
      notifier["conversationCache"].set("0xaddress1", mockConversation);
      notifier["conversationCache"].set("0xaddress2", mockConversation);
      expect(notifier.getCachedConversationCount()).toBe(2);

      notifier.clearConversationCache();
      expect(notifier.getCachedConversationCount()).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle undefined member addresses", async () => {
      const memberWithoutAddresses = {
        inboxId: "test-inbox-id",
        addresses: undefined,
      } as unknown as GroupMember;

      const { getEthereumAddressesOfMember } = jest.requireMock(
        "../lib/conversation_member.js",
      );
      getEthereumAddressesOfMember.mockReturnValue([]);

      mockXmtpClientConversationsListFn.mockResolvedValue([mockConversation]);
      mockConversation.members.mockResolvedValue([memberWithoutAddresses]);

      await notifier.sendNotification(testAddress, testMessage);

      expect(console.log).toHaveBeenCalledWith(
        `No existing conversation found with ${testAddress}, cannot send notification`,
      );
    });

    it("should handle malformed addresses", async () => {
      const malformedAddress = "not-an-ethereum-address";

      mockXmtpClientConversationsListFn.mockResolvedValue([]);

      await notifier.sendNotification(malformedAddress, testMessage);

      // Should still attempt to process, even with malformed address
      expect(mockXmtpClientConversationsListFn).toHaveBeenCalled();
    });

    it("should handle very long notification messages", async () => {
      const longMessage = "A".repeat(10000); // Very long message
      notifier["conversationCache"].set(
        testAddress.toLowerCase(),
        mockConversation,
      );
      mockConversationSendFn.mockResolvedValue(undefined);

      await notifier.sendNotification(testAddress, longMessage);

      expect(mockConversation.send).toHaveBeenCalledWith(longMessage);
      expect(console.log).toHaveBeenCalledWith(
        `Notification sent to ${testAddress}: ${longMessage}`,
      );
    });
  });
});
