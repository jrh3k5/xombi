import { XmtpEnv } from "@xmtp/agent-sdk";

/**
 * The configuration of an XMTP client to be created by the factory.
 */
export interface XMTPConfig {
  /**
   * The key used to sign XMTP messages sent using the client.
   */
  signerKey: `0x${string}`;
  /**
   * The key used to encrypt the local storage of messages.
   */
  encryptionKey: `0x${string}`;
  /**
   * The XMTP environment to which this agent should connect.
   */
  environment: XmtpEnv;
  /**
   * true if installations should be auto-revoked if the max number of
   * installations has been met or exceeded; anything else will not auto-revoke
   * installations in such cases.
   */
  autoRevokeInstallations?: boolean;
}

/**
 * Validates that the necessary data within the given configuration is present and correctly formatted.
 * @param config The configuration to be validated
 */
function validateConfig(config: XMTPConfig): void {
  if (!config.signerKey) {
    throw new Error(
      "invalid Xombi signer key; must be of type `0x${string}`",
    );
  }
  if (!config.encryptionKey) {
    throw new Error(
      "invalid XMTP encryption key; must be of type `0x${string}`",
    );
  }
  if (!["local", "dev", "production"].includes(config.environment)) {
    throw new Error(`invalid XMTP_ENV: ${config.environment}`);
  }
}

/**
 * Parses XMTP configuration from an environment.
 * @returns An XMTPConfig built ouf the environmental configuration.
 */
export function parseEnvironmentConfig(): XMTPConfig {
  const signerKey = process.env.XOMBI_SIGNER_KEY as `0x${string}`;
  const encryptionKey = process.env.XMTP_ENCRYPTION_KEY as `0x${string}`;

  let environment: XmtpEnv = "production";
  const envEnv = process.env.XMTP_ENV;
  if (envEnv) {
    environment = envEnv as XmtpEnv;
  }

  const autoRevokeInstallations =
    process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS?.toLowerCase() === "true";

  const config: XMTPConfig = {
    signerKey,
    encryptionKey,
    environment,
    autoRevokeInstallations,
  };

  validateConfig(config);
  return config;
}
