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

export interface AppConfig {
  allowedAddresses: string[];
}

export class AppInitializer {
  static initializeEnvironment(): void {
    dotenv.config();
  }

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
        await conversation?.send(
          "Sorry, I encountered an unexpected error while processing your message.",
        );
      }
    }
  }
}
