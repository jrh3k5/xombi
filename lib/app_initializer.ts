import dotenv from "dotenv";
import { newClient, type OmbiClient } from "../ombi/client.js";
import { triageCurrentStep } from "../media/triage.js";
import { getEthereumAddressesOfMember } from "./conversation_member.js";
import {
  XMTPClientFactory,
  XMTPInstallationLimitError,
  XMTPClientCreationError,
} from "./xmtp_client_factory.js";
import { WebhookInitializer } from "./webhook_initializer.js";
import {
  Client,
  Conversation,
  DecodedMessage,
  Dm,
  IdentifierKind,
  type Identifier,
} from "@xmtp/node-sdk";
import { RequestTracker } from "../webhook/server.js";
import { UnresolvableAddressError } from "../ombi/errors.js";

const errorMessageUnresolvedUser =
  "There is a user mapping configuration issue. Please contact xombi's administrator for more help.\n\nUntil this is resolved, you will not be able to use xombi.";

/**
 * Configuation for the application.
 */
export interface AppConfig {
  /**
   * The Ethereum addresses of accounts that are allowed to communicate with the bot.
   */
  allowedAddresses: string[];
  /**
   * The Ethereum addresses of accounts that are treated as administrators.
   */
  adminAddresses: string[];
}

/**
 * A class used to initialize and run the application.
 */
export class AppInitializer {
  /**
   * Initializes the environment, reading from configuration.
   */
  static initializeEnvironment(): void {
    dotenv.config();
  }

  /**
   * Parses available configuration into an AppConfig instance.
   * @returns An AppConfig built out of the currently-available configuration.
   */
  static parseAppConfig(): AppConfig {
    let allowedAddresses: string[] = [];
    const envAllowlist = process.env.ALLOW_LIST;
    if (envAllowlist) {
      allowedAddresses = envAllowlist
        .split(",")
        .map((address) => address.trim())
        .map((address) => address.toLowerCase());
    }

    let adminAddresses: string[] = [];
    const envAdminAddresses = process.env.ADMIN_ADDRESSES;
    if (envAdminAddresses) {
      adminAddresses = envAdminAddresses
        .split(",")
        .map((address) => address.trim())
        .map((address) => address.toLowerCase());
    }

    return { allowedAddresses, adminAddresses };
  }

  /**
   * Sends a startup announcement to admin addresses.
   * @param xmtpClient The XMTP client to use for sending messages
   * @param adminAddresses List of admin Ethereum addresses to notify
   */
  static async sendAdminAnnouncements(
    xmtpClient: Client,
    adminAddresses: string[],
  ): Promise<void> {
    if (adminAddresses.length === 0) {
      return;
    }

    console.log("Sending startup announcements to admin addresses...");

    // Look for existing 1-on-1 conversation with each admin
    const conversations = await xmtpClient.conversations.list();
    console.debug(`Evaluating ${conversations.length} existing conversations to send startup announcements to ${adminAddresses.length} admin(s)`);

    for (const adminAddress of adminAddresses) {
      try {
        let conversation: Dm | undefined;

        for (const conv of conversations) {
          const members = await conv.members();

          // Only send to conversations with exactly 2 members (bot + admin)
          if (members.length !== 2) {
            console.debug(`Conversation with admin address ${adminAddress} has ${members.length} members; will not use for startup announcement`);

            continue;
          }

          let hasAdmin = false;
          let hasBot = false;

          for (const member of members) {
            if (member.inboxId === xmtpClient.inboxId) {
              hasBot = true;
            } else {
              const addresses = getEthereumAddressesOfMember(member);
              if (
                addresses.some(
                  (addr) => addr.toLowerCase() === adminAddress.toLowerCase(),
                )
              ) {
                hasAdmin = true;
              }
            }
          }

          // Only use this conversation if it's a 1-on-1 DM with the admin
          if (hasAdmin && hasBot) {
            if ("send" in conv) {
              conversation = conv as Dm;

              break;
            } else {
              console.debug(`Identified a direct conversation with admin address ${adminAddress} lacks a 'send' member; it will not be used for the startup announcement`);
            }
          }
        }

        if (!conversation) {
          console.debug(
            `No existing 1-on-1 conversation found with admin ${adminAddress}, creating new conversation`,
          );
          try {
            // Convert Ethereum address to inbox ID
            const identifier: Identifier = {
              identifier: adminAddress,
              identifierKind: IdentifierKind.Ethereum,
            };
            const inboxId = await xmtpClient.getInboxIdByIdentifier(identifier);

            if (!inboxId) {
              console.error(
                `Could not find inbox ID for admin ${adminAddress}. The address may not be registered on XMTP.`,
              );
              continue;
            }

            conversation = await xmtpClient.conversations.newDm(inboxId);
            console.log(`New conversation created with admin: ${adminAddress}`);
          } catch (createError) {
            console.error(
              `Failed to create conversation with admin ${adminAddress}:`,
              createError,
            );
          }
        }

        if (conversation) {
          await conversation.send("🤖 xombi is now online and ready!");
          console.log(`Startup announcement sent to admin: ${adminAddress}`);
        }
      } catch (error) {
        console.error(
          `Failed to send startup announcement to admin ${adminAddress}:`,
          error,
        );
      }
    }
  }

  /**
   * Initializes the application, including the configuration.
   */
  static async initialize(): Promise<void> {
    this.initializeEnvironment();

    const appConfig = this.parseAppConfig();
    console.log("xombi starting");
    console.log(
      "Allowing messages from addresses:",
      appConfig.allowedAddresses,
    );

    const ombiClient = newClient();

    // Initialize XMTP client
    let xmtpResult;
    try {
      const xmtpConfig = XMTPClientFactory.parseEnvironmentConfig();
      xmtpResult = await XMTPClientFactory.createClient(xmtpConfig);
    } catch (error) {
      if (error instanceof XMTPInstallationLimitError) {
        console.error("\n❌ XMTP Installation Limit Error");
        console.error(
          "Your XMTP identity has reached the maximum number of installations.",
        );
        console.error("\nTo resolve this issue, you can:");
        error.getResolutionSteps().forEach((step) => console.error(step));
        console.error("\nFor more information, see: https://docs.xmtp.org/");
        console.error(`\nOriginal error: ${error.message}`);
        process.exit(1);
      } else if (error instanceof XMTPClientCreationError) {
        console.error("XMTP client creation failed:", error.message);
        throw error;
      } else {
        throw error;
      }
    }

    console.log(
      `Agent initialized on ${xmtpResult.account.address}\nSend a message on http://xmtp.chat/dm/${xmtpResult.account.address}?env=${xmtpResult.environment}`,
    );

    // Initialize webhook system
    const webhookConfig = WebhookInitializer.parseEnvironmentConfig();
    const webhookComponents = await WebhookInitializer.initializeWebhookSystem(
      webhookConfig,
      xmtpResult.client,
    );

    // Send startup announcements to admins
    await this.sendAdminAnnouncements(
      xmtpResult.client,
      appConfig.adminAddresses,
    );

    // Start message processing loop
    await this.startMessageProcessingLoop(
      xmtpResult.client,
      appConfig.allowedAddresses,
      ombiClient,
      webhookComponents?.requestTracker,
    );
  }

  /**
   * Starts the loop to listen for messages to the bot.
   * @param xmtpClient A Client used to interact with users over XMTP.
   * @param allowedAddresses A list of Ethereum addresses that are authorized to communicate with this bot.
   * @param ombiClient A client used to interact with Ombi.
   * @param requestTracker A tracker used to know who to contact when a particular request has completed.
   */
  static async startMessageProcessingLoop(
    xmtpClient: Client,
    allowedAddresses: string[],
    ombiClient: OmbiClient,
    requestTracker?: RequestTracker,
  ): Promise<void> {
    for await (const message of await xmtpClient.conversations.streamAllMessages()) {
      let conversation: Conversation | undefined;
      try {
        if (
          message?.senderInboxId.toLowerCase() ===
            xmtpClient.inboxId.toLowerCase() ||
          message?.contentType?.typeId !== "text" ||
          typeof message.content !== "string"
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
          await conversation.send(
            "Sorry, I'm not allowed to talk to strangers.",
          );
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
              conversation! as Dm,
              requestTracker,
            );
          },
        );

        await Promise.all(triagePromises);
      } catch (err) {
        console.log(err);

        if (err instanceof UnresolvableAddressError) {
          await conversation?.send(errorMessageUnresolvedUser);
        } else {
          await conversation?.send(
            "Sorry, I encountered an unexpected error while processing your message.",
          );
        }
      }
    }
  }
}
