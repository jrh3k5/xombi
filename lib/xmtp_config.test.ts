import { parseEnvironmentConfig } from "./xmtp_config.js";

describe("parseEnvironmentConfig", () => {
  beforeEach(() => {
    // Clear environment variables
    delete process.env.XOMBI_SIGNER_KEY;
    delete process.env.XMTP_ENCRYPTION_KEY;
    delete process.env.XMTP_ENV;
    delete process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS;
  });

  it("should parse environment variables correctly", () => {
    process.env.XOMBI_SIGNER_KEY = "0xsignerkey";
    process.env.XMTP_ENCRYPTION_KEY = "0xencryptionkey";
    process.env.XMTP_ENV = "dev";
    process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS = "true";

    const config = parseEnvironmentConfig();

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

    const config = parseEnvironmentConfig();

    expect(config.environment).toBe("production");
    expect(config.autoRevokeInstallations).toBe(false);
  });

  it("should throw error for missing required environment variables", () => {
    expect(() => parseEnvironmentConfig()).toThrow(
      "invalid Xombi signer key; must be of type `0x${string}`",
    );
  });
});
