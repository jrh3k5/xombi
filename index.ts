import { Chain, Hex, toBytes } from "viem";
import {
  Client,
  type ClientOptions,
  type DecodedMessage,
  Dm,
  XmtpEnv,
} from "@xmtp/node-sdk";
import dotenv from "dotenv";
import { newClient } from "./ombi/client";
import { triageCurrentStep } from "./media/triage";
import { mainnet, sepolia } from "viem/chains";
import { convertEOAToSigner } from "./lib/eoa";
import { privateKeyToAccount } from "viem/accounts";
import { getEthereumAddressesOfMember } from "./lib/conversation_member";
import { WebhookServer } from "./webhook/server";
import { MemoryRequestTracker } from "./state/request_tracker";
import { XMTPNotifier } from "./webhook/notify";
import { WebhookManager } from "./ombi/webhook";
import { buildWebhookURL } from "./lib/network";

async function main(): Promise<void> {
  dotenv.config();

  let allowedAddresses: string[] = [];
  const envAllowlist = process.env.ALLOW_LIST;
  if (envAllowlist) {
    allowedAddresses = envAllowlist
      .split(",")
      .map((address) => address.trim())
      .map((address) => address.toLowerCase());
  }

  console.log("xombi starting");
  console.log("Allowing messages from addresses:", allowedAddresses);

  const ombiClient = newClient();

  // Check if webhooks are enabled
  const webhooksEnabled = process.env.OMBI_XOMBI_WEBHOOK_ENABLED?.toLowerCase() === 'true';
  
  // Initialize webhook components only if enabled
  let requestTracker: MemoryRequestTracker | undefined;
  let webhookServer: WebhookServer | undefined;
  let webhookManager: WebhookManager | undefined;

  if (webhooksEnabled) {
    requestTracker = new MemoryRequestTracker();

    const ombiXombiApplicationKey = process.env.OMBI_XOMBI_APPLICATION_KEY;
    if (!ombiXombiApplicationKey) {
      throw "OMBI_XOMBI_APPLICATION_KEY environment variable is required when webhooks are enabled";
    }

    let webhookAllowlistedIPS: string[]
    const configuredAllowlistedIPs = process.env.OMBI_XOMBI_WEBHOOK_ALLOWLISTED_IPS;
    if (configuredAllowlistedIPs) {
      webhookAllowlistedIPS = configuredAllowlistedIPs.split(",")
    } else {
      webhookAllowlistedIPS = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
    }

    webhookServer = new WebhookServer(requestTracker, ombiXombiApplicationKey, webhookAllowlistedIPS);
    
    // Get Ombi configuration for webhook registration
    const ombiApiUrl = process.env.OMBI_API_URL || "http://localhost:5000";
    const ombiApiKey = process.env.OMBI_API_KEY;
    if (!ombiApiKey) {
      throw "OMBI_API_KEY environment variable is required";
    }
    
    webhookManager = new WebhookManager(ombiApiUrl, ombiApiKey);
  }

  const xombiSignerKey = process.env.XOMBI_SIGNER_KEY as `0x${string}`;
  if (!xombiSignerKey) {
    throw "invalid Xombi signer key; must be of type `0x${string}`";
  }
  const account = privateKeyToAccount(xombiSignerKey as Hex);

  const xmtpEncryptionKey = process.env.XMTP_ENCRYPTION_KEY as `0x${string}`;
  if (!xmtpEncryptionKey) {
    throw "invalid XMTP encryption key; must be of type `0x${string}`";
  }

  let xmtpEncryptionKeyBytes: Uint8Array;
  try {
    xmtpEncryptionKeyBytes = toBytes(xmtpEncryptionKey);
  } catch (error) {
    throw "failed to convert XMTP encryption key to bytes: " + error;
  }

  let xmtpEnv: XmtpEnv = "production";
  const envEnv = process.env.XMTP_ENV;
  if (envEnv) {
    if (["local", "dev", "production"].indexOf(envEnv) < 0) {
      throw "invalid XMTP_ENV: " + envEnv;
    }
    xmtpEnv = envEnv as XmtpEnv;
  }

  let chain: Chain = mainnet;
  if (xmtpEnv !== "production") {
    chain = sepolia;
  }

  const clientOptions: ClientOptions = {
    dbEncryptionKey: xmtpEncryptionKeyBytes,
    env: xmtpEnv,
  };
  const eoaSigner = await convertEOAToSigner(account, chain);
  
  let xmtpClient: Client;
  try {
    xmtpClient = await Client.create(eoaSigner, clientOptions) as Client;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage?.includes('installation') && errorMessage?.includes('registered')) {
      const shouldRevoke = process.env.XMTP_REVOKE_ALL_OTHER_INSTALLATIONS?.toLowerCase() === 'true';
      
      if (shouldRevoke) {
        console.log("🔄 XMTP installation limit reached. Auto-revoking other installations...");
        try {
          console.log("⚠️  WARNING: This will revoke ALL other XMTP installations for this identity!");
          
          // Extract inbox ID from the error message
          const inboxIdMatch = errorMessage.match(/InboxID (\w+)/);
          if (!inboxIdMatch) {
            throw new Error("Could not extract InboxID from error message");
          }
          const inboxId = inboxIdMatch[1];
          console.log(`Found InboxID: ${inboxId}`);
          
          // Get inbox state to find all installations
          console.log("Getting inbox state to find installations...");
          const inboxStates = await Client.inboxStateFromInboxIds([inboxId], xmtpEnv);
          
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
            xmtpEnv
          );
          
          console.log("✅ Successfully revoked all installations. Retrying client creation...");
          
          // Now try to create the main client again
          xmtpClient = await Client.create(eoaSigner, clientOptions) as Client;
          console.log("✅ XMTP client created successfully after revocation");
        } catch (revokeError: unknown) {
          const revokeErrorMessage = revokeError instanceof Error ? revokeError.message : String(revokeError);
          console.error("❌ Auto-revocation failed:", revokeErrorMessage);
          console.error("\nTo resolve this issue manually, you can:");
          console.error("1. Use a different private key for XOMBI_SIGNER_KEY in your .env file");
          console.error("2. Or use an existing XMTP client/app to revoke installations");
          console.error("3. Or wait for installations to expire (they have a limited lifespan)");
          console.error("4. Or contact XMTP support for assistance");
          console.error("\nFor more information, see: https://docs.xmtp.org/");
          console.error(`\nOriginal error: ${errorMessage}`);
          process.exit(1);
        }
      } else {
        console.error("\n❌ XMTP Installation Limit Error");
        console.error("Your XMTP identity has reached the maximum number of installations.");
        console.error("\nTo resolve this issue, you can:");
        console.error("1. Use a different private key for XOMBI_SIGNER_KEY in your .env file");
        console.error("2. Or revoke existing installations using an XMTP client");
        console.error("3. Or wait for installations to expire (they have a limited lifespan)");
        console.error("4. Or set XMTP_REVOKE_ALL_OTHER_INSTALLATIONS=true to automatically revoke");
        console.error("\nFor more information, see: https://docs.xmtp.org/");
        console.error(`\nOriginal error: ${errorMessage}`);
        process.exit(1);
      }
    } else {
      console.error("XMTP client creation failed:", errorMessage);
      throw error;
    }
  }

  console.log(
    `Agent initialized on ${account.address}\nSend a message on http://xmtp.chat/dm/${account.address}?env=${xmtpEnv}`,
  );

  // Initialize webhook system if enabled
  if (webhooksEnabled && webhookServer && webhookManager && requestTracker) {
    console.log("Webhook notifications enabled - setting up webhook system");
    
    // Initialize XMTP notifier and setup webhook notification handler  
    const xmtpNotifier = new XMTPNotifier(xmtpClient as Client);
    webhookServer.setNotificationHandler(async (address: string, message: string) => {
      await xmtpNotifier.sendNotification(address, message);
    });

    // Start webhook server
    const webhookPort = 3000;
    await webhookServer.start(webhookPort);
    
    // Register webhook with Ombi
    try {
      // Check if a custom base URL is provided
      const customBaseUrl = process.env.OMBI_XOMBI_WEBHOOK_BASE_URL;
      let webhookUrl: string;
      
      if (customBaseUrl) {
        webhookUrl = `${customBaseUrl}/webhook`;
        console.log(`Using custom webhook base URL: ${customBaseUrl}`);
      } else {
        webhookUrl = buildWebhookURL(webhookPort);
      }
      
      console.log(`Registering webhook URL: ${webhookUrl}`);
      const registered = await webhookManager.registerWebhook(webhookUrl);
      if (registered) {
        console.log("Webhook successfully registered with Ombi");
      } else {
        console.warn("Failed to register webhook with Ombi - notifications may not work");
      }
    } catch (error) {
      console.error("Error setting up webhook:", error);
      console.warn("Continuing without webhook notifications");
    }
  } else {
    console.log("Webhook notifications disabled");
  }

  for await (const message of await xmtpClient.conversations.streamAllMessages()) {
    let conversation: Dm | undefined;
    try {
      if (
        message?.senderInboxId.toLowerCase() ===
          xmtpClient.inboxId.toLowerCase() ||
        message?.contentType?.typeId !== "text"
      ) {
        continue;
      }

      const senderInboxId = message.senderInboxId;
      conversation = xmtpClient.conversations.getDmByInboxId(senderInboxId);
      if (!conversation) {
        continue;
      }

      const conversationMembers = await conversation.members();
      // Remove the agent's address from the members - make sure everyone else is authorized to talk to the agent
      for (let i = conversationMembers.length - 1; i >= 0; i--) {
        if (conversationMembers[i].inboxId == xmtpClient.inboxId) {
          conversationMembers.splice(i, 1);
        } else if (conversationMembers[i].inboxId !== senderInboxId) {
          conversationMembers.splice(i, 1);
        }
      }

      // Not sure how this can happen, but, just in case
      if (conversationMembers.length == 0) {
        continue;
      }

      // Are any of the members not allowed?
      let allowedCount: number = 0;
      const allEthereumAddresses = new Set<string>();
      for (let i = conversationMembers.length - 1; i >= 0; i--) {
        const senderAddresses = getEthereumAddressesOfMember(
          conversationMembers[i],
        );
        if (senderAddresses.length == 0) {
          // Unexpected identifier; this only works with Ethereum addresses, presently
          break;
        }
        const allSenderAllowed = senderAddresses.some(
          (senderAddress) =>
            allowedAddresses.indexOf(senderAddress.toLowerCase()) >= 0,
        );
        if (allSenderAllowed) {
          allowedCount++;
        }

        senderAddresses.forEach((senderAddress) => {
          allEthereumAddresses.add(senderAddress);
        });
      }

      if (allowedCount < conversationMembers.length) {
        await conversation.send("Sorry, I'm not allowed to talk to strangers.");

        continue;
      }

      if (typeof message.content !== "string") {
        continue;
      }

      const triagePromises = Array.from(allEthereumAddresses).map(
        (senderAddress) => {
          return triageCurrentStep(
            ombiClient,
            senderAddress as `0x${string}`,
            message as DecodedMessage<string>,
            conversation!,
            requestTracker,
          );
        },
      );

      await Promise.all(triagePromises);
    } catch (err) {
      console.log(err);
      await conversation?.send(
        "Sorry, I encountered an unexpected error while processing your message.",
      );
    }
  }
}

main().catch((error) => {
  console.error("failed to run main():", error);
  // log and rethrow - it's an anti-pattern, but logging
  // gets a stacktrace and throwing signals an erroneous exist
  throw error;
});
