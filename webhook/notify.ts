import { Client, Dm } from '@xmtp/node-sdk';
import { getEthereumAddressesOfMember } from '../lib/conversation_member';

export class XMTPNotifier {
  private xmtpClient: Client;
  private conversationCache: Map<string, Dm> = new Map();

  constructor(xmtpClient: Client) {
    this.xmtpClient = xmtpClient;
  }

  async sendNotification(address: string, message: string): Promise<void> {
    try {
      // Try to get existing conversation from cache
      let conversation = this.conversationCache.get(address.toLowerCase());
      
      if (!conversation) {
        // Look for existing conversation
        const conversations = await this.xmtpClient.conversations.list();
        
        for (const conv of conversations) {
          const members = await conv.members();
          const hasTargetMember = members.some(member => {
            const addresses = getEthereumAddressesOfMember(member);
            return addresses.some(addr => 
              addr.toLowerCase() === address.toLowerCase()
            );
          });
          
          if (hasTargetMember && 'send' in conv) {
            conversation = conv as Dm;
            this.conversationCache.set(address.toLowerCase(), conversation);
            break;
          }
        }
      }

      if (!conversation) {
        console.log(`No existing conversation found with ${address}, cannot send notification`);
        return;
      }

      await conversation.send(message);
      console.log(`Notification sent to ${address}: ${message}`);
    } catch (error) {
      console.error(`Failed to send notification to ${address}:`, error);
      throw error;
    }
  }

  clearConversationCache(): void {
    this.conversationCache.clear();
  }

  getCachedConversationCount(): number {
    return this.conversationCache.size;
  }
}