import { Chain, Hex, toBytes } from "viem";
import { Client, type ClientOptions, Dm, XmtpEnv } from "@xmtp/node-sdk";
import dotenv from "dotenv";
import { newClient } from "./ombi/client";
import { triageCurrentStep } from "./media/triage";
import { mainnet, sepolia } from "viem/chains";
import { convertEOAToSigner } from "./lib/eoa";
import { privateKeyToAccount } from "viem/accounts";
import { getEthereumAddressesOfMember } from "./lib/conversation_member";

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
  const xmtpClient = await Client.create(eoaSigner, clientOptions);

  console.log(
    `Agent initialized on ${account.address}\nSend a message on http://xmtp.chat/dm/${account.address}?env=${xmtpEnv}`,
  );

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

      const triagePromises = Array.from(allEthereumAddresses).map(
        (senderAddress) => {
          return triageCurrentStep(
            ombiClient,
            senderAddress as `0x${string}`,
            message,
            conversation!,
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
