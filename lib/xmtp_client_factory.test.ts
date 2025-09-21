import {
  XMTPClientFactory,
  XMTPConfig,
  XMTPInstallationLimitError,
} from "./xmtp_client_factory.js";
import { XmtpEnv } from "@xmtp/node-sdk";

// Mock dependencies
jest.mock("viem", () => ({
  toBytes: jest.fn(),
  mainnet: "mainnet",
  sepolia: "sepolia",
}));

jest.mock("viem/accounts", () => ({
  privateKeyToAccount: jest.fn(),
}));

jest.mock("@xmtp/node-sdk", () => ({
  Client: {
    create: jest.fn(),
    inboxStateFromInboxIds: jest.fn(),
    revokeInstallations: jest.fn(),
  },
}));

jest.mock("./eoa", () => ({
  convertEOAToSigner: jest.fn(),
}));

describe("XMTPClientFactory", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.XOMBI_SIGNER_KEY;
    delete process.env.XMTP_ENCRYPTION_KEY;
    delete process.env.XMTP_ENV;
    delete process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS;
  });

  describe("validateConfig", () => {
    it("should throw error for missing signer key", () => {
      const config: XMTPConfig = {
        signerKey: "" as `0x${string}`,
        encryptionKey: "0x1234567890abcdef",
        environment: "dev",
      };

      expect(() => XMTPClientFactory.validateConfig(config)).toThrow(
        "invalid Xombi signer key; must be of type `0x${string}`",
      );
    });

    it("should throw error for missing encryption key", () => {
      const config: XMTPConfig = {
        signerKey: "0x1234567890abcdef",
        encryptionKey: "" as `0x${string}`,
        environment: "dev",
      };

      expect(() => XMTPClientFactory.validateConfig(config)).toThrow(
        "invalid XMTP encryption key; must be of type `0x${string}`",
      );
    });

    it("should throw error for invalid environment", () => {
      const config: XMTPConfig = {
        signerKey: "0x1234567890abcdef",
        encryptionKey: "0x1234567890abcdef",
        environment: "invalid" as XmtpEnv,
      };

      expect(() => XMTPClientFactory.validateConfig(config)).toThrow(
        "invalid XMTP_ENV: invalid",
      );
    });

    it("should pass validation for valid config", () => {
      const config: XMTPConfig = {
        signerKey: "0x1234567890abcdef",
        encryptionKey: "0x1234567890abcdef",
        environment: "dev",
      };

      expect(() => XMTPClientFactory.validateConfig(config)).not.toThrow();
    });
  });

  describe("parseEnvironmentConfig", () => {
    it("should parse environment variables correctly", () => {
      process.env.XOMBI_SIGNER_KEY = "0xsignerkey";
      process.env.XMTP_ENCRYPTION_KEY = "0xencryptionkey";
      process.env.XMTP_ENV = "dev";
      process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS = "true";

      const config = XMTPClientFactory.parseEnvironmentConfig();

      expect(config).toEqual({
        signerKey: "0xsignerkey",
        encryptionKey: "0xencryptionkey",
        environment: "dev",
        autoRevokeInstallations: true,
      });
    });

    it("should default to production environment", () => {
      process.env.XOMBI_SIGNER_KEY = "0xsignerkey";
      process.env.XMTP_ENCRYPTION_KEY = "0xencryptionkey";

      const config = XMTPClientFactory.parseEnvironmentConfig();

      expect(config.environment).toBe("production");
      expect(config.autoRevokeInstallations).toBe(false);
    });

    it("should throw error for missing required environment variables", () => {
      expect(() => XMTPClientFactory.parseEnvironmentConfig()).toThrow(
        "invalid Xombi signer key; must be of type `0x${string}`",
      );
    });
  });

  describe("createClient", () => {
    const mockConfig: XMTPConfig = {
      signerKey: "0x1234567890abcdef",
      encryptionKey: "0x1234567890abcdef",
      environment: "dev",
      autoRevokeInstallations: false,
    };

    it("should create client successfully", async () => {
      const mockClient = { id: "mock-client" };
      const mockAccount = { address: "0xmockaddress" };
      const mockSigner = { sign: jest.fn() };

      jest
        .requireMock("viem")
        .toBytes.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
      jest
        .requireMock("viem/accounts")
        .privateKeyToAccount.mockReturnValue(mockAccount);
      jest
        .requireMock("./eoa")
        .convertEOAToSigner.mockResolvedValue(mockSigner);
      jest
        .requireMock("@xmtp/node-sdk")
        .Client.create.mockResolvedValue(mockClient);

      const result = await XMTPClientFactory.createClient(mockConfig);

      expect(result).toEqual({
        client: mockClient,
        account: mockAccount,
        environment: "dev",
      });
    });

    it("should throw XMTPInstallationLimitError when installation limit reached without auto-revoke", async () => {
      const installationError = new Error(
        "Cannot register a new installation because the InboxID abc123 has already registered 20/10 installations",
      );

      jest
        .requireMock("viem")
        .toBytes.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
      jest
        .requireMock("viem/accounts")
        .privateKeyToAccount.mockReturnValue({ address: "0xmockaddress" });
      jest
        .requireMock("./eoa")
        .convertEOAToSigner.mockResolvedValue({ sign: jest.fn() });
      jest
        .requireMock("@xmtp/node-sdk")
        .Client.create.mockRejectedValue(installationError);

      await expect(XMTPClientFactory.createClient(mockConfig)).rejects.toThrow(
        XMTPInstallationLimitError,
      );
    });

    it("should auto-revoke and retry when installation limit reached with auto-revoke enabled", async () => {
      const configWithAutoRevoke = {
        ...mockConfig,
        autoRevokeInstallations: true,
      };
      const installationError = new Error(
        "Cannot register a new installation because the InboxID abc123 has already registered 20/10 installations",
      );
      const mockClient = { id: "mock-client" };
      const mockAccount = { address: "0xmockaddress" };
      const mockSigner = { sign: jest.fn() };

      jest
        .requireMock("viem")
        .toBytes.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
      jest
        .requireMock("viem/accounts")
        .privateKeyToAccount.mockReturnValue(mockAccount);
      jest
        .requireMock("./eoa")
        .convertEOAToSigner.mockResolvedValue(mockSigner);

      // Mock first call fails with installation limit, second succeeds
      jest
        .requireMock("@xmtp/node-sdk")
        .Client.create.mockRejectedValueOnce(installationError)
        .mockResolvedValueOnce(mockClient);

      // Mock inbox state and revocation
      jest
        .requireMock("@xmtp/node-sdk")
        .Client.inboxStateFromInboxIds.mockResolvedValue([
          {
            installations: [
              { bytes: new Uint8Array([1]) },
              { bytes: new Uint8Array([2]) },
            ],
          },
        ]);
      jest
        .requireMock("@xmtp/node-sdk")
        .Client.revokeInstallations.mockResolvedValue(undefined);

      const result = await XMTPClientFactory.createClient(configWithAutoRevoke);

      expect(result.client).toBe(mockClient);
      expect(
        jest.requireMock("@xmtp/node-sdk").Client.revokeInstallations,
      ).toHaveBeenCalledWith(
        mockSigner,
        "abc123",
        [new Uint8Array([1]), new Uint8Array([2])],
        "dev",
      );
    });
  });
});

describe("XMTPInstallationLimitError", () => {
  it("should provide resolution steps without auto-revoke", () => {
    const error = new XMTPInstallationLimitError("test message", false);
    const steps = error.getResolutionSteps();

    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("different private key");
    expect(steps[1]).toContain("revoke existing installations");
    expect(steps[2]).toContain("wait for installations to expire");
  });

  it("should provide resolution steps with auto-revoke option", () => {
    const error = new XMTPInstallationLimitError("test message", true);
    const steps = error.getResolutionSteps();

    expect(steps).toHaveLength(4);
    expect(steps[3]).toContain("XMTP_REVOKE_ALL_OTHER_INSTALLATIONS=true");
  });
});
