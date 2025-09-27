import dotenv from "dotenv";
import { newClient, type OmbiClient } from "../ombi/client.js";
import { triageCurrentStep } from "../media/triage.js";
import { getEthereumAddressesOfMember } from "./conversation_member.js";
import { parseEnvironmentConfig } from "./xmtp_config.js";
import { WebhookInitializer } from "./webhook_initializer.js";
import { DecodedMessage, Dm } from "@xmtp/node-sdk";
import { Agent, filter } from "@xmtp/agent-sdk";
import { RequestTracker } from "../webhook/server.js";
import { UnresolvableAddressError } from "../ombi/errors.js";
import { convertEOAToSigner } from "./eoa.js";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet, sepolia } from "viem/chains";
import { toBytes } from "viem";

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

    // Initialize XMTP Agent
    let agent: Agent;
    let agentAddress: string;
    let environment: string;
    try {
      const xmtpConfig = parseEnvironmentConfig();

      // Create signer from config
      const account = privateKeyToAccount(xmtpConfig.signerKey);
      const chain = xmtpConfig.environment === "production" ? mainnet : sepolia;
      const signer = convertEOAToSigner(account, chain);

      // Create agent with config
      agent = await Agent.create(signer, {
        env: xmtpConfig.environment,
        dbEncryptionKey: toBytes(xmtpConfig.encryptionKey),
      });

      agentAddress = account.address;
      environment = xmtpConfig.environment;
    } catch (error) {
      console.error("Agent creation failed:", error);
      throw error;
    }

    console.log(
      `Agent initialized on ${agentAddress}\nSend a message on http://xmtp.chat/dm/${agentAddress}?env=${environment}`,
    );

    // Initialize webhook system
    const webhookConfig = WebhookInitializer.parseEnvironmentConfig();
    const webhookComponents = await WebhookInitializer.initializeWebhookSystem(
      webhookConfig,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      agent.client as any,
    );

    // Set up message handler
    this.setupMessageHandler(
      agent,
      appConfig.allowedAddresses,
      ombiClient,
      webhookComponents?.requestTracker,
    );

    // Start the agent
    await agent.start();
  }

  /**
   * Sets up the Agent SDK text message handler.
   * @param agent The Agent instance to configure.
   * @param allowedAddresses A list of Ethereum addresses that are authorized to communicate with this bot.
   * @param ombiClient A client used to interact with Ombi.
   * @param requestTracker A tracker used to know who to contact when a particular request has completed.
   */
  static setupMessageHandler(
    agent: Agent,
    allowedAddresses: string[],
    ombiClient: OmbiClient,
    requestTracker?: RequestTracker,
  ): void {
    agent.on("text", async (ctx) => {
      try {
        // Skip messages from self
        if (filter.fromSelf(ctx.message, ctx.client)) {
          return;
        }

        // Ensure message has defined content
        if (!filter.hasContent(ctx.message) || !filter.isText(ctx.message)) {
          return;
        }

        const conversationMembers = await ctx.conversation.members();
        // Remove the agent's address from the members - make sure everyone else is authorized to talk to the agent
        const filteredMembers = conversationMembers.filter(
          (member) => member.inboxId !== ctx.client.inboxId && member.inboxId === ctx.message.senderInboxId
        );

        // Not sure how this can happen, but, just in case
        if (filteredMembers.length === 0) {
          return;
        }

        // Are any of the members not allowed?
        let allowedCount: number = 0;
        const allEthereumAddresses = new Set<string>();
        for (const member of filteredMembers) {
          const senderAddresses = getEthereumAddressesOfMember(member);
          if (senderAddresses.length === 0) {
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

        if (allowedCount < filteredMembers.length) {
          await ctx.conversation.send(
            "Sorry, I'm not allowed to talk to strangers.",
          );
          return;
        }

        const triagePromises = Array.from(allEthereumAddresses).map(
          (senderAddress) => {
            return triageCurrentStep(
              ombiClient,
              senderAddress as `0x${string}`,
              ctx.message as DecodedMessage<string>,
              ctx.conversation as Dm,
              requestTracker,
            );
          },
        );

        await Promise.all(triagePromises);
      } catch (err) {
        console.log(err);

        if (err instanceof UnresolvableAddressError) {
          await ctx.conversation.send(errorMessageUnresolvedUser);
        } else {
          await ctx.conversation.send(
            "Sorry, I encountered an unexpected error while processing your message.",
          );
        }
      }
    });

    // Handle agent errors
    agent.on("unhandledError", (error) => {
      console.error("Agent error:", error);
    });
  }
}
