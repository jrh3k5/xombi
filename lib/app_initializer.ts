import dotenv from "dotenv";
import { newClient, type OmbiClient } from "../ombi/client";
import { triageCurrentStep } from "../media/triage";
import { getEthereumAddressesOfMember } from "./conversation_member";
import {
  XMTPClientFactory,
  XMTPInstallationLimitError,
  XMTPClientCreationError,
} from "./xmtp_client_factory";
import { WebhookInitializer } from "./webhook_initializer";
import { Client, Conversation, DecodedMessage, Dm } from "@xmtp/node-sdk";
import { RequestTracker } from "../webhook/server";
import { UnresolvableAddressError } from "../ombi/errors";

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

    return { allowedAddresses };
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
