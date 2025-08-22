import { Chain, Hex, toBytes } from "viem";
import { Client, type ClientOptions, XmtpEnv } from "@xmtp/node-sdk";
import { mainnet, sepolia } from "viem/chains";
import { convertEOAToSigner } from "./eoa";
import { Signer } from "@xmtp/node-sdk";
import { privateKeyToAccount } from "viem/accounts";

export interface XMTPConfig {
  signerKey: `0x${string}`;
  encryptionKey: `0x${string}`;
  environment: XmtpEnv;
  autoRevokeInstallations?: boolean;
}

export interface XMTPClientCreationResult {
  client: Client;
  account: ReturnType<typeof privateKeyToAccount>;
  environment: XmtpEnv;
}

export class XMTPClientFactory {
  static validateConfig(config: XMTPConfig): void {
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

  static parseEnvironmentConfig(): XMTPConfig {
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

    this.validateConfig(config);
    return config;
  }

  static async createClient(
    config: XMTPConfig,
  ): Promise<XMTPClientCreationResult> {
    const account = privateKeyToAccount(config.signerKey as Hex);

    let encryptionKeyBytes: Uint8Array;
    try {
      encryptionKeyBytes = toBytes(config.encryptionKey);
    } catch (error) {
      throw new Error(
        "failed to convert XMTP encryption key to bytes: " + error,
      );
    }

    const chain: Chain =
      config.environment === "production" ? mainnet : sepolia;

    const clientOptions: ClientOptions = {
      dbEncryptionKey: encryptionKeyBytes,
      env: config.environment,
    };

    const eoaSigner = await convertEOAToSigner(account, chain);

    let client: Client;
    try {
      client = (await Client.create(eoaSigner, clientOptions)) as Client;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      if (
        errorMessage?.includes("installation") &&
        errorMessage?.includes("registered")
      ) {
        if (config.autoRevokeInstallations) {
          console.log(
            "🔄 XMTP installation limit reached. Auto-revoking other installations...",
          );
          client = await this.handleInstallationLimitWithRevocation(
            error,
            eoaSigner,
            clientOptions,
            config.environment,
          );
        } else {
          throw new XMTPInstallationLimitError(
            errorMessage,
            config.autoRevokeInstallations || false,
          );
        }
      } else {
        throw new XMTPClientCreationError(
          `XMTP client creation failed: ${errorMessage}`,
        );
      }
    }

    return {
      client,
      account,
      environment: config.environment,
    };
  }

  private static async handleInstallationLimitWithRevocation(
    originalError: unknown,
    eoaSigner: Signer,
    clientOptions: ClientOptions,
    environment: XmtpEnv,
  ): Promise<Client> {
    const errorMessage =
      originalError instanceof Error
        ? originalError.message
        : String(originalError);

    console.log(
      "⚠️  WARNING: This will revoke ALL other XMTP installations for this identity!",
    );

    // Extract inbox ID from the error message
    const inboxIdMatch = errorMessage.match(/InboxID (\w+)/);
    if (!inboxIdMatch) {
      throw new Error("Could not extract InboxID from error message");
    }
    const inboxId = inboxIdMatch[1];
    console.log(`Found InboxID: ${inboxId}`);

    // Get inbox state to find all installations
    console.log("Getting inbox state to find installations...");
    const inboxStates = await Client.inboxStateFromInboxIds(
      [inboxId],
      environment,
    );

    if (!inboxStates || inboxStates.length === 0) {
      throw new Error("Failed to retrieve inbox state");
    }

    const installations = inboxStates[0].installations;
    if (!installations || installations.length === 0) {
      throw new Error("No installations found to revoke");
    }

    console.log(`Found ${installations.length} installations to revoke`);

    // Get installation bytes for revocation
    const toRevokeInstallationBytes = installations.map((i) => i.bytes);

    // Revoke installations using static method
    console.log("Revoking all installations...");
    await Client.revokeInstallations(
      eoaSigner,
      inboxId,
      toRevokeInstallationBytes,
      environment,
    );

    console.log(
      "✅ Successfully revoked all installations. Retrying client creation...",
    );

    // Now try to create the main client again
    const client = (await Client.create(eoaSigner, clientOptions)) as Client;
    console.log("✅ XMTP client created successfully after revocation");

    return client;
  }
}

export class XMTPInstallationLimitError extends Error {
  constructor(
    message: string,
    public autoRevokeAvailable: boolean,
  ) {
    super(message);
    this.name = "XMTPInstallationLimitError";
  }

  getResolutionSteps(): string[] {
    const steps = [
      "1. Use a different private key for XOMBI_SIGNER_KEY in your .env file",
      "2. Or revoke existing installations using an XMTP client",
      "3. Or wait for installations to expire (they have a limited lifespan)",
    ];

    if (this.autoRevokeAvailable) {
      steps.push(
        "4. Or set XMTP_REVOKE_ALL_OTHER_INSTALLATIONS=true to automatically revoke",
      );
    }

    return steps;
  }
}

export class XMTPClientCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XMTPClientCreationError";
  }
}
