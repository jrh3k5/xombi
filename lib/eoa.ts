import {
  Chain,
  createWalletClient,
  http,
  PrivateKeyAccount,
  toBytes,
} from "viem";
import { Signer } from "@xmtp/node-sdk";
import { IdentifierKind } from "@xmtp/node-bindings";

export function convertEOAToSigner(
  account: PrivateKeyAccount,
  chain: Chain,
): Signer {
  const walletClient = createWalletClient({
    account: account,
    chain: chain,
    transport: http(),
  });
  return {
    getIdentifier: () => ({
      identifierKind: IdentifierKind.Ethereum,
      identifier: account.address.toLowerCase(),
    }),
    type: "EOA",
    signMessage: async (message) => {
      const signResult = await walletClient.signMessage({
        message: typeof message === "string" ? message : { raw: message },
      });

      return toBytes(signResult);
    },
  };
}
