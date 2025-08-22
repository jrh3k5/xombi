import { getLocalIPAddress, buildWebhookURL } from './network';
import { networkInterfaces } from 'os';

// Mock the os module
jest.mock('os', () => ({
  networkInterfaces: jest.fn(),
}));

describe('network utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getLocalIPAddress', () => {
    it('should return IPv4 address when available', () => {
      const mockInterfaces = {
        eth0: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true, // This should be skipped
            cidr: '127.0.0.1/8',
          },
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('192.168.1.100');
    });

    it('should skip internal (loopback) addresses', () => {
      const mockInterfaces = {
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
        eth0: [
          {
            address: '10.0.0.5',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '10.0.0.5/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('10.0.0.5');
    });

    it('should skip IPv6 addresses', () => {
      const mockInterfaces = {
        eth0: [
          {
            address: '::1',
            netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
            family: 'IPv6',
            mac: '00:00:00:00:00:00',
            internal: false,
            cidr: '::1/128',
          },
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('192.168.1.100');
    });

    it('should return first valid IPv4 address when multiple available', () => {
      const mockInterfaces = {
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
        eth1: [
          {
            address: '10.0.0.5',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:66',
            internal: false,
            cidr: '10.0.0.5/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('192.168.1.100'); // Should return the first one found
    });

    it('should return undefined when no valid IPv4 address found', () => {
      const mockInterfaces = {
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true, // Internal address, should be skipped
            cidr: '127.0.0.1/8',
          },
        ],
        eth0: [
          {
            address: '::1',
            netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
            family: 'IPv6', // IPv6 address, should be skipped
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '::1/128',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBeUndefined();
    });

    it('should handle empty network interfaces', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({});

      const result = getLocalIPAddress();
      expect(result).toBeUndefined();
    });

    it('should handle undefined network interface', () => {
      const mockInterfaces = {
        eth0: undefined,
        eth1: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('192.168.1.100');
    });

    it('should handle empty network interface array', () => {
      const mockInterfaces = {
        eth0: [],
        eth1: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = getLocalIPAddress();
      expect(result).toBe('192.168.1.100');
    });
  });

  describe('buildWebhookURL', () => {
    it('should build webhook URL with default port', () => {
      const mockInterfaces = {
        eth0: [
          {
            address: '192.168.1.100',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '192.168.1.100/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = buildWebhookURL();
      expect(result).toBe('http://192.168.1.100:3000/webhook');
    });

    it('should build webhook URL with custom port', () => {
      const mockInterfaces = {
        eth0: [
          {
            address: '10.0.0.5',
            netmask: '255.255.255.0',
            family: 'IPv4',
            mac: '00:11:22:33:44:55',
            internal: false,
            cidr: '10.0.0.5/24',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      const result = buildWebhookURL(8080);
      expect(result).toBe('http://10.0.0.5:8080/webhook');
    });

    it('should throw error when no local IP address is found', () => {
      const mockInterfaces = {
        lo: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
      };

      (networkInterfaces as jest.Mock).mockReturnValue(mockInterfaces);

      expect(() => buildWebhookURL()).toThrow('Could not determine local IP address for webhook URL');
    });

    it('should throw error with custom port when no local IP address is found', () => {
      (networkInterfaces as jest.Mock).mockReturnValue({});

      expect(() => buildWebhookURL(5000)).toThrow('Could not determine local IP address for webhook URL');
    });
  });
});