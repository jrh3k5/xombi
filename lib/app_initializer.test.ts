import { AppInitializer } from './app_initializer';
import { XMTPInstallationLimitError, XMTPClientCreationError } from './xmtp_client_factory';
import { XmtpEnv } from '@xmtp/node-sdk';

// Mock dependencies
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('../ombi/client', () => ({
  newClient: jest.fn().mockReturnValue({ id: 'mock-ombi-client' }),
}));

jest.mock('./xmtp_client_factory', () => ({
  XMTPClientFactory: {
    parseEnvironmentConfig: jest.fn(),
    createClient: jest.fn(),
  },
  XMTPInstallationLimitError: class extends Error {
    constructor(message: string, public autoRevokeAvailable: boolean) {
      super(message);
      this.name = 'XMTPInstallationLimitError';
    }
    getResolutionSteps() {
      return ['step1', 'step2', 'step3'];
    }
  },
  XMTPClientCreationError: class extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'XMTPClientCreationError';
    }
  },
}));

jest.mock('./webhook_initializer', () => ({
  WebhookInitializer: {
    parseEnvironmentConfig: jest.fn().mockReturnValue({ enabled: false }),
    initializeWebhookSystem: jest.fn().mockResolvedValue(null),
  },
}));

describe('AppInitializer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.ALLOW_LIST;
    
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseAppConfig', () => {
    it('should return empty array when no ALLOW_LIST provided', () => {
      const config = AppInitializer.parseAppConfig();
      
      expect(config.allowedAddresses).toEqual([]);
    });

    it('should parse comma-separated allowed addresses', () => {
      process.env.ALLOW_LIST = '0x1234567890ABCDEF,0xFEDCBA0987654321, 0xABCD1234';

      const config = AppInitializer.parseAppConfig();

      expect(config.allowedAddresses).toEqual([
        '0x1234567890abcdef',
        '0xfedcba0987654321',
        '0xabcd1234'
      ]);
    });

    it('should trim and lowercase addresses', () => {
      process.env.ALLOW_LIST = ' 0X1234 , 0XABCD ';

      const config = AppInitializer.parseAppConfig();

      expect(config.allowedAddresses).toEqual(['0x1234', '0xabcd']);
    });
  });

  describe('initialize', () => {
    const mockXmtpResult = {
      client: { id: 'mock-xmtp-client' },
      account: { address: '0xmockaddress' },
      environment: 'dev' as XmtpEnv,
    };

    it('should initialize successfully with webhooks disabled', async () => {
      process.env.ALLOW_LIST = '0x1234';
      
      const { XMTPClientFactory } = jest.requireMock('./xmtp_client_factory');
      const { WebhookInitializer } = jest.requireMock('./webhook_initializer');

      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: '0xsigner',
        encryptionKey: '0xencryption',
        environment: 'dev',
      });
      XMTPClientFactory.createClient.mockResolvedValue(mockXmtpResult);

      // Mock the message processing loop to avoid infinite loop
      jest.spyOn(AppInitializer, 'startMessageProcessingLoop').mockImplementation(async () => {
        // Do nothing, just return
      });

      await AppInitializer.initialize();

      expect(jest.requireMock('dotenv').config).toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith('xombi starting');
      expect(console.log).toHaveBeenCalledWith('Allowing messages from addresses:', ['0x1234']);
      expect(console.log).toHaveBeenCalledWith(
        `Agent initialized on ${mockXmtpResult.account.address}\nSend a message on http://xmtp.chat/dm/${mockXmtpResult.account.address}?env=${mockXmtpResult.environment}`
      );

      expect(WebhookInitializer.parseEnvironmentConfig).toHaveBeenCalled();
      expect(WebhookInitializer.initializeWebhookSystem).toHaveBeenCalledWith(
        { enabled: false },
        mockXmtpResult.client
      );
    });

    it('should handle XMTP installation limit error gracefully', async () => {
      process.env.ALLOW_LIST = '0x1234';
      
      const { XMTPClientFactory } = jest.requireMock('./xmtp_client_factory');
      
      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: '0xsigner',
        encryptionKey: '0xencryption',
        environment: 'dev',
      });

      const installationError = new XMTPInstallationLimitError('Installation limit reached', true);
      XMTPClientFactory.createClient.mockRejectedValue(installationError);

      await expect(AppInitializer.initialize()).rejects.toThrow('process.exit called');

      expect(console.error).toHaveBeenCalledWith('\n❌ XMTP Installation Limit Error');
      expect(console.error).toHaveBeenCalledWith('Your XMTP identity has reached the maximum number of installations.');
      expect(console.error).toHaveBeenCalledWith('\nTo resolve this issue, you can:');
      expect(console.error).toHaveBeenCalledWith('step1');
      expect(console.error).toHaveBeenCalledWith('step2');
      expect(console.error).toHaveBeenCalledWith('step3');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle XMTP client creation error', async () => {
      process.env.ALLOW_LIST = '0x1234';
      
      const { XMTPClientFactory } = jest.requireMock('./xmtp_client_factory');
      
      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: '0xsigner',
        encryptionKey: '0xencryption',
        environment: 'dev',
      });

      const creationError = new XMTPClientCreationError('Client creation failed');
      XMTPClientFactory.createClient.mockRejectedValue(creationError);

      await expect(AppInitializer.initialize()).rejects.toThrow(XMTPClientCreationError);

      expect(console.error).toHaveBeenCalledWith('XMTP client creation failed:', 'Client creation failed');
    });

    it('should rethrow unknown errors', async () => {
      process.env.ALLOW_LIST = '0x1234';
      
      const { XMTPClientFactory } = jest.requireMock('./xmtp_client_factory');
      
      XMTPClientFactory.parseEnvironmentConfig.mockReturnValue({
        signerKey: '0xsigner',
        encryptionKey: '0xencryption',
        environment: 'dev',
      });

      const unknownError = new Error('Unknown error');
      XMTPClientFactory.createClient.mockRejectedValue(unknownError);

      await expect(AppInitializer.initialize()).rejects.toThrow('Unknown error');
    });
  });

  describe('startMessageProcessingLoop', () => {
    it('should be a function that handles message processing', () => {
      expect(typeof AppInitializer.startMessageProcessingLoop).toBe('function');
    });

    // Note: Testing the full message processing loop would require extensive mocking
    // of XMTP client behavior, which would be complex. In a real implementation,
    // this would likely be split into smaller, more testable functions.
  });
});