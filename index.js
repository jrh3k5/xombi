import { Wallet } from "ethers";
import { Client } from "@xmtp/node-sdk";
import dotenv from 'dotenv';
import { newClient } from "./ombi/client.js";
import { triageCurrentStep } from "./media/triage.js";
import { getRandomValues } from "node:crypto";

dotenv.config();

let allowedAddresses = [];
if (process.env.ALLOW_LIST) {
  allowedAddresses = process.env.ALLOW_LIST.split(",");
}

console.log("xombi starting");
console.log("Allowing messages from addresses:", allowedAddresses);

const ombiClient = newClient();

const key = process.env.KEY;
const wallet = new Wallet(key);

const eoaSigner = await convertEOAToSigner(wallet);
const encryptionKey = getRandomValues(new Uint8Array(32));
const xmtpClient = await Client.create(eoaSigner, encryptionKey, {
    env: process.env.XMTP_ENV || "production",
});

await xmtpClient.publishUserContact();

console.log(`Listening on ${xmtpClient.address}`);

for await (const message of await xmtpClient.conversations.streamAllMessages()) {
    try {
      if (message.senderAddress == xmtpClient.address) {
        continue;
      }

      const senderAddress = message.senderAddress;
      if (message.recipientAddress === senderAddress) {
        continue;
      }
      
      if (allowedAddresses.indexOf(senderAddress) < 0) {
        await context.reply("Sorry, I'm not allowed to talk to strangers.");
        
        continue;
      }
    
      await triageCurrentStep(ombiClient, message)();
    } catch (err) {
        console.log(err);
        await message.conversation.send("Sorry, I encountered an unexpected error while processing your message.");
    }
}

function convertEOAToSigner(eoaAccount) {
    return {
      getAddress: async () => eoaAccount.address,
      signMessage: async (message) =>
        eoaAccount.signMessage({
          message: typeof message === "string" ? message : { raw: message },
        }),
      walletType: () => undefined,
      getChainId: () => undefined,
      getBlockNumber: () => undefined,
    };
  }