import run from "@xmtp/bot-starter";
import dotenv from 'dotenv';

dotenv.config();

let allowedAddresses = [];
if (process.env.ALLOW_LIST) {
  allowedAddresses = process.env.ALLOW_LIST.split(",");
}

console.log("xombi starting");
console.log("Allowing messages from addresses:", allowedAddresses);

// Call `run` with a handler function. The handler function is called
// with a HandlerContext
run(async (context) => {
  const senderAddress = context.message.senderAddress;
  if (allowedAddresses.indexOf(senderAddress) < 0) {
    await context.reply("Sorry, I'm not allowed to talk to strangers.");
    return;
  }

  // When someone sends your bot a message, you can get the DecodedMessage
  // from the HandlerContext's `message` field
  const messageBody = context.message.content;

  // To reply, just call `reply` on the HandlerContext.
  await context.reply(`ECHO: ${messageBody}`);
});