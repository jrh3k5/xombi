import express from "express";
import { Server } from "http";

export interface WebhookPayload {
  eventType?: string;
  subject?: string;
  message?: string;
  image?: string;
  mediaType?: string;
  requestId?: number;
  requestType?: string;
}

export interface RequestTracker {
  trackRequest(
    requestId: string,
    mediaType: "movie" | "tv",
    requesterAddress: string,
  ): void;
  getRequester(requestId: string): string | undefined;
  removeRequest(requestId: string): void;
}

export class WebhookServer {
  private app: express.Application;
  private server: Server | undefined;
  private requestTracker: RequestTracker;
  private notificationHandler?: (
    address: string,
    message: string,
  ) => Promise<void>;
  private ombiToken: string;
  private allowlistedIPs: string[];

  constructor(
    requestTracker: RequestTracker,
    ombiToken: string,
    allowlistedIPs: string[],
    trustProxy?: boolean,
  ) {
    this.app = express();

    if (trustProxy ?? false) {
      this.app.set("trust proxy", 1);
    }

    this.requestTracker = requestTracker;
    this.ombiToken = ombiToken;
    this.allowlistedIPs = allowlistedIPs;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Middleware to validate requests are from Ombi
    this.app.use("/webhook", (req, res, next) => {
      if (!this.isValidOmbiRequest(req)) {
        console.log("Rejected unauthorized webhook request from:", req.ip);
        return res.status(403).json({ error: "Forbidden" });
      }
      next();
    });
  }

  private isValidOmbiRequest(req: express.Request): boolean {
    // Check if request comes from an allowlisted IP (where Ombi is running)
    const clientIP =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    let isAllowlistedIP = false;
    this.allowlistedIPs.forEach((allowlistedIP) => {
      if (isAllowlistedIP) {
        return;
      }

      // Direct match
      if (clientIP == allowlistedIP) {
        isAllowlistedIP = true;
        return;
      }

      // Handle IPv4-mapped IPv6 addresses
      // If clientIP is IPv4-mapped (::ffff:x.x.x.x) and allowlisted is IPv4, compare the IPv4 parts
      if (clientIP?.startsWith("::ffff:") && !allowlistedIP.includes(":")) {
        const ipv4Part = clientIP.substring(7); // Remove "::ffff:" prefix
        if (ipv4Part === allowlistedIP) {
          isAllowlistedIP = true;
          return;
        }
      }

      // Handle reverse case: if allowlisted is IPv4-mapped and clientIP is IPv4
      if (
        allowlistedIP.startsWith("::ffff:") &&
        clientIP &&
        !clientIP.includes(":")
      ) {
        const ipv4Part = allowlistedIP.substring(7); // Remove "::ffff:" prefix
        if (clientIP === ipv4Part) {
          isAllowlistedIP = true;
          return;
        }
      }
    });

    if (!isAllowlistedIP) {
      return false;
    }

    // If we have an application token configured, validate it
    const authHeader = req.headers["authorization"];
    const tokenHeader = req.headers["x-application-token"];

    const providedToken = authHeader?.replace("Bearer ", "") || tokenHeader;
    return providedToken == this.ombiToken;
  }

  private setupRoutes() {
    this.app.post("/webhook", (req, res) => {
      this.handleWebhook(req, res);
    });

    this.app.get("/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });
  }

  private async handleWebhook(req: express.Request, res: express.Response) {
    try {
      const payload = req.body as WebhookPayload;
      console.log("Received webhook:", JSON.stringify(payload, null, 2));

      if (this.isAvailabilityNotification(payload)) {
        await this.handleAvailabilityNotification(payload);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error handling webhook:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private isAvailabilityNotification(payload: WebhookPayload): boolean {
    const eventType = payload.eventType?.toLowerCase() || "";
    const subject = payload.subject?.toLowerCase() || "";
    const message = payload.message?.toLowerCase() || "";

    const availabilityKeywords = [
      "available",
      "downloaded",
      "ready",
      "completed",
    ];

    return availabilityKeywords.some(
      (keyword) =>
        eventType.includes(keyword) ||
        subject.includes(keyword) ||
        message.includes(keyword),
    );
  }

  private async handleAvailabilityNotification(payload: WebhookPayload) {
    if (!payload.requestId || !this.notificationHandler) {
      return;
    }

    const requestId = payload.requestId.toString();
    const requesterAddress = this.requestTracker.getRequester(requestId);

    if (!requesterAddress) {
      console.log(`No requester found for request ID: ${requestId}`);
      return;
    }

    const mediaTitle = this.extractMediaTitle(payload);
    const notificationMessage = `🎉 Your ${payload.mediaType || "content"} "${mediaTitle}" is now available!`;

    try {
      await this.notificationHandler(requesterAddress, notificationMessage);
      this.requestTracker.removeRequest(requestId);
      console.log(`Sent notification to ${requesterAddress} for ${mediaTitle}`);
    } catch (error) {
      console.error(
        `Failed to send notification to ${requesterAddress}:`,
        error,
      );
    }
  }

  private extractMediaTitle(payload: WebhookPayload): string {
    if (payload.subject) {
      const match = payload.subject.match(/"([^"]+)"/);
      if (match) return match[1];
    }

    return payload.subject || payload.message || "Unknown";
  }

  public setNotificationHandler(
    handler: (address: string, message: string) => Promise<void>,
  ) {
    this.notificationHandler = handler;
  }

  public async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, () => {
          console.log(`Webhook server running on port ${port}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log("Webhook server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}
