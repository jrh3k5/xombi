import express from "express";
import { Server } from "http";

export interface WebhookPayload {
  requestId?: number | null;
  requestedUser?: string | null;
  title?: string | null;
  requestedDate?: string | null;
  type?: string | null;
  additionalInformation?: string | null;
  longDate?: string | null;
  shortDate?: string | null;
  longTime?: string | null;
  shortTime?: string | null;
  overview?: string | null;
  year?: number | null;
  episodesList?: string | null;
  seasonsList?: string | null;
  posterImage?: string | null;
  applicationName?: string | null;
  applicationUrl?: string | null;
  issueDescription?: string | null;
  issueCategory?: string | null;
  issueStatus?: string | null;
  issueSubject?: string | null;
  newIssueComment?: string | null;
  issueUser?: string | null;
  userName?: string | null;
  alias?: string | null;
  requestedByAlias?: string | null;
  userPreference?: string | null;
  denyReason?: string | null;
  availableDate?: string | null;
  requestStatus?: string | null;
  providerId?: string | null;
  partiallyAvailableEpisodeNumbers?: string | null;
  partiallyAvailableSeasonNumber?: number | null;
  partiallyAvailableEpisodesList?: string | null;
  partiallyAvailableEpisodeCount?: number | null;
  notificationType?: string | null;
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
  private debugEnabled: boolean;

  constructor(
    requestTracker: RequestTracker,
    ombiToken: string,
    allowlistedIPs: string[],
    trustProxy?: boolean,
    debugEnabled?: boolean,
  ) {
    this.app = express();

    if (trustProxy ?? false) {
      this.app.set("trust proxy", 1);
    }

    this.requestTracker = requestTracker;
    this.ombiToken = ombiToken;
    this.allowlistedIPs = allowlistedIPs;
    this.debugEnabled = debugEnabled ?? false;
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Debug middleware to log requests before validation
    this.app.use("/webhook", (req, res, next) => {
      if (this.debugEnabled) {
        console.log("=== WEBHOOK DEBUG ===");
        console.log(
          "Headers:",
          JSON.stringify(this.censorHeaders(req.headers), null, 2),
        );
        console.log("Body:", JSON.stringify(req.body, null, 2));
        console.log("=====================");
      }
      next();
    });

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
    const tokenHeader = req.headers["access-token"];

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

      if (this.isTestNotification(payload)) {
        this.handleTestNotification();
      } else if (this.isNotificationForUser(payload)) {
        await this.handleUserNotification(payload);
      }

      res.status(200).json({ received: true });
    } catch (error) {
      console.error("Error handling webhook:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  private censorHeaders(
    headers: express.Request["headers"],
  ): Record<string, string | string[] | undefined> {
    const censoredHeaders = { ...headers };

    if (censoredHeaders.authorization) {
      censoredHeaders.authorization = "Bearer ***CENSORED***";
    }

    if (censoredHeaders["access-token"]) {
      censoredHeaders["access-token"] = "***CENSORED***";
    }

    return censoredHeaders;
  }

  private isTestNotification(payload: WebhookPayload): boolean {
    const notificationType = payload.notificationType?.toLowerCase() || "";
    return notificationType === "test";
  }

  private handleTestNotification(): void {
    console.log("🎉 Webhook test notification received successfully!");
  }

  private isNotificationForUser(payload: WebhookPayload): boolean {
    const requestStatus = payload.requestStatus?.toLowerCase() || "";
    return requestStatus === "available" || requestStatus === "denied";
  }

  private async handleUserNotification(payload: WebhookPayload) {
    if (!payload.requestId || !this.notificationHandler) {
      return;
    }

    const requestId = payload.requestId.toString();
    const requesterAddress = this.requestTracker.getRequester(requestId);

    if (!requesterAddress) {
      console.log(`No requester found for request ID: ${requestId}`);
      return;
    }

    const mediaTitle = payload.title || "Unknown";
    const requestStatus = payload.requestStatus?.toLowerCase() || "";

    let notificationMessage: string;
    if (requestStatus === "available") {
      notificationMessage = `🎉 Your ${payload.type || "content"} "${mediaTitle}" is now available!`;
    } else if (requestStatus === "denied") {
      const reason = payload.denyReason ? ` Reason: ${payload.denyReason}` : "";
      notificationMessage = `❌ Your request for "${mediaTitle}" has been denied.${reason}`;
    } else {
      return; // Shouldn't happen as we check in isNotificationForUser
    }

    try {
      await this.notificationHandler(requesterAddress, notificationMessage);
      this.requestTracker.removeRequest(requestId);
      console.log(
        `Sent notification to ${requesterAddress} for ${mediaTitle} (${requestStatus})`,
      );
    } catch (error) {
      console.error(
        `Failed to send notification to ${requesterAddress}:`,
        error,
      );
    }
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
