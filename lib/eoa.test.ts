import { convertEOAToSigner } from "./eoa";
import { IdentifierKind } from "@xmtp/node-bindings";

jest.mock("viem", () => {
  return {
    createWalletClient: jest.fn(() => ({
      signMessage: jest.fn().mockResolvedValue("signed"),
    })),
    http: jest.fn(),
    toBytes: jest.fn(() => new Uint8Array([1, 2, 3])),
  };
});

import * as viem from "viem";
import type { PrivateKeyAccount, Chain, Hex } from "viem";
const { createWalletClient, toBytes } = viem;

describe("convertEOAToSigner", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a Signer with correct identifier", () => {
    const account = {
      address: "0xabc",
      publicKey: "0x0" as Hex,
      // required dummy fields
      type: "local",
      source: "privateKey",
      sign: async () => "0x0" as `0x${string}`,
      signAuthorization: async () =>
        ({ dummy: true }) as unknown as ReturnType<
          PrivateKeyAccount["signAuthorization"]
        >,
      signMessage: async () => "0x0" as `0x${string}`,
      signTransaction: async () =>
        "0x010203" as unknown as ReturnType<
          PrivateKeyAccount["signTransaction"]
        >,
      signTypedData: async () => "0x0" as `0x${string}`,
      nonceManager: undefined,
    } as PrivateKeyAccount;
    const chain = {
      id: 1,
      name: "test",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["http://localhost"] } },
    } as Chain;
    const signer = convertEOAToSigner(account, chain);
    const id = signer.getIdentifier() as {
      identifierKind: number;
      identifier: string;
    };
    expect(id.identifierKind).toBe(IdentifierKind.Ethereum);
    expect(id.identifier).toBe("0xabc");
    expect(signer.type).toBe("EOA");
  });

  it("signMessage calls walletClient.signMessage and returns bytes", async () => {
    const fakeBytes = new Uint8Array([1, 2, 3]);
    (toBytes as jest.Mock).mockReturnValue(fakeBytes);
    const account = {
      address: "0xabc",
      publicKey: "0x0" as Hex,
      type: "local",
      source: "privateKey",
      sign: async () => "0x0" as `0x${string}`,
      signAuthorization: async () =>
        ({ dummy: true }) as unknown as ReturnType<
          PrivateKeyAccount["signAuthorization"]
        >,
      signMessage: async () => "0x0" as `0x${string}`,
      signTransaction: async () =>
        "0x010203" as unknown as ReturnType<
          PrivateKeyAccount["signTransaction"]
        >,
      signTypedData: async () => "0x0" as `0x${string}`,
      nonceManager: undefined,
    } as PrivateKeyAccount;
    const chain = {
      id: 1,
      name: "test",
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: ["http://localhost"] } },
    } as Chain;
    const signer = convertEOAToSigner(account, chain);
    const result = await signer.signMessage("hello");
    expect(result).toBe(fakeBytes);
    expect(createWalletClient).toHaveBeenCalled();
    expect(toBytes).toHaveBeenCalled();
  });
});
