import { getEthereumAddressesOfMember } from "./conversation_member";
import { IdentifierKind } from "@xmtp/node-bindings";
import type { GroupMember } from "@xmtp/node-sdk";

describe("getEthereumAddressesOfMember", () => {
  it("returns only Ethereum addresses from member identifiers", () => {
    const member: GroupMember = {
      accountIdentifiers: [
        { identifierKind: IdentifierKind.Ethereum, identifier: "0xabc" },
        { identifierKind: 2 as IdentifierKind, identifier: "not_eth" }, // Not Ethereum
        { identifierKind: IdentifierKind.Ethereum, identifier: "0xdef" },
        { identifierKind: IdentifierKind.Ethereum, identifier: "" }, // Empty
      ],
      // required dummy fields
      inboxId: "inbox",
      installationIds: [],
      permissionLevel: 0,
      consentState: 0,
    } as GroupMember;
    const result = getEthereumAddressesOfMember(member);
    expect(result).toEqual(["0xabc", "0xdef"]);
  });

  it("returns an empty array if no Ethereum addresses", () => {
    const member = {
      accountIdentifiers: [
        { identifierKind: 2 as IdentifierKind, identifier: "foo" },
        { identifierKind: 3 as IdentifierKind, identifier: "bar" },
      ],
      inboxId: "inbox",
      installationIds: [],
      permissionLevel: 0,
      consentState: 0,
    } as GroupMember;
    const result = getEthereumAddressesOfMember(member);
    expect(result).toEqual([]);
  });

  it("handles missing accountIdentifiers gracefully", () => {
    const member = {
      accountIdentifiers: [],
      inboxId: "inbox",
      installationIds: [],
      permissionLevel: 0,
      consentState: 0,
    } as GroupMember;
    const result = getEthereumAddressesOfMember(member);
    expect(result).toEqual([]);
  });
});
