import { networkInterfaces } from "os";

/**
 * Gets the IP address of the machine on which the application is currently running.
 * @returns The IP address (if it can be resolved) of the current machine; otherwise, undefined.
 */
export function getLocalIPAddress(): string | undefined {
  const interfaces = networkInterfaces();

  for (const name of Object.keys(interfaces)) {
    const netInterface = interfaces[name];
    if (!netInterface) continue;

    for (const net of netInterface) {
      // Skip internal (loopback) addresses and IPv6
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }

  return undefined;
}

/**
 * Builds a URL to be invoked by Ombi's webhook notification.
 * @param port The port on which this agent is listening for webhook notifications.
 * @returns A URL that can be invoked by Ombi's webhook notification.
 */
export function buildWebhookURL(port: number = 3000): string {
  const localIP = getLocalIPAddress();
  if (!localIP) {
    throw new Error("Could not determine local IP address for webhook URL");
  }

  return `http://${localIP}:${port}/webhook`;
}
