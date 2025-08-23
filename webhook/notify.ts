import { Client, Dm } from "@xmtp/node-sdk";
import { getEthereumAddressesOfMember } from "../lib/conversation_member";

/**
 * Service for sending XMTP notifications to users about their media requests.
 * Handles conversation management and message delivery via the XMTP protocol.
 * Caches conversations for improved performance.
 */
export class XMTPNotifier {
  private xmtpClient: Client;
  private conversationCache: Map<string, Dm> = new Map();

  /**
   * Create a new XMTP notifier instance.
   * @param xmtpClient The XMTP client instance for sending messages
   */
  constructor(xmtpClient: Client) {
    this.xmtpClient = xmtpClient;
  }

  /**
   * Send a notification message to a user's wallet address via XMTP.
   * Looks for existing conversations and uses caching for performance.
   * Only sends to existing conversations to avoid spam.
   * @param address The wallet address of the recipient
   * @param message The notification message to send
   * @throws Error if message cannot be sent to an existing conversation
   */
  async sendNotification(address: string, message: string): Promise<void> {
    try {
      // Try to get existing conversation from cache
      let conversation = this.conversationCache.get(address.toLowerCase());

      if (!conversation) {
        // Look for existing conversation
        const conversations = await this.xmtpClient.conversations.list();

        for (const conv of conversations) {
          const members = await conv.members();
          const hasTargetMember = members.some((member) => {
            const addresses = getEthereumAddressesOfMember(member);
            return addresses.some(
              (addr) => addr.toLowerCase() === address.toLowerCase(),
            );
          });

          if (hasTargetMember && "send" in conv) {
            conversation = conv as Dm;
            this.conversationCache.set(address.toLowerCase(), conversation);
            break;
          }
        }
      }

      if (!conversation) {
        console.log(
          `No existing conversation found with ${address}, cannot send notification`,
        );
        return;
      }

      await conversation.send(message);
      console.log(`Notification sent to ${address}: ${message}`);
    } catch (error) {
      console.error(`Failed to send notification to ${address}:`, error);
      throw error;
    }
  }

  /**
   * Clear the conversation cache.
   * Useful for testing or when conversation state may have changed.
   */
  clearConversationCache(): void {
    this.conversationCache.clear();
  }

  /**
   * Get the number of cached conversations.
   * @returns The number of conversations currently cached
   */
  getCachedConversationCount(): number {
    return this.conversationCache.size;
  }
}
