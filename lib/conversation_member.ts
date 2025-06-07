import { GroupMember } from "@xmtp/node-sdk";
import { IdentifierKind } from "@xmtp/node-bindings";

// getEthereumAddressOfMember gets the Ethereum addresses of the given members.
export function getEthereumAddressesOfMember(
  member: GroupMember,
): `0x${string}`[] {
  const ids = member.accountIdentifiers ?? [];
  return ids
    .filter(
      (identifier) => identifier.identifierKind === IdentifierKind.Ethereum,
    )
    .map((identifier) => identifier.identifier as `0x${string}`)
    .filter((i) => !!i);
}
