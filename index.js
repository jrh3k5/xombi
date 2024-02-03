import run from "@xmtp/bot-starter";
import dotenv from 'dotenv';
import { newClient } from "./ombi/client.js";
import { triageCurrentStep } from "./media/triage.js";

dotenv.config();

let allowedAddresses = [];
if (process.env.ALLOW_LIST) {
  allowedAddresses = process.env.ALLOW_LIST.split(",");
}

console.log("xombi starting");
console.log("Allowing messages from addresses:", allowedAddresses);

const ombiClient = newClient();

// Call `run` with a handler function. The handler function is called
// with a HandlerContext
run(async (context) => {
  const senderAddress = context.message.senderAddress;
  if (allowedAddresses.indexOf(senderAddress) < 0) {
    await context.reply("Sorry, I'm not allowed to talk to strangers.");
    return;
  }

  try {
    await triageCurrentStep(ombiClient, context)();
  } catch (err) {
    console.log(err);
    await context.reply("Sorry, I encountered an unexpected error while processing your message.");
  }
});