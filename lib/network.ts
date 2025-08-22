import { networkInterfaces } from "os";

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

export function buildWebhookURL(port: number = 3000): string {
  const localIP = getLocalIPAddress();
  if (!localIP) {
    throw new Error("Could not determine local IP address for webhook URL");
  }

  return `http://${localIP}:${port}/webhook`;
}
