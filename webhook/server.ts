import express from "express";
import { Server } from "http";

/**
 * Represents the payload structure received from Ombi webhook notifications.
 * Contains information about media requests and their status changes.
 */
export interface WebhookPayload {
  requestId?: number | string | null;
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

/**
 * Interface for tracking media requests and associating them with requester addresses.
 * Supports tracking by both internal request IDs and provider IDs with media types.
 */
export interface RequestTracker {
  /**
   * Track a media request by its provider ID, associating it with a requester address.
   * @param requestId The provider ID (e.g., TheMovieDB ID) of the requested media
   * @param mediaType The type of media being requested (movie or tv)
   * @param requesterAddress The wallet address of the user making the request
   */
  trackRequest(
    requestId: string,
    mediaType: "movie" | "tv",
    requesterAddress: string,
  ): void;
  /**
   * Get the requester address for a given request ID (backward compatibility).
   * @param requestId The request ID to look up
   * @returns The wallet address of the requester, or undefined if not found
   */
  getRequester(requestId: string): string | undefined;
  /**
   * Get the requester address for a given provider ID and media type.
   * @param providerId The provider ID (e.g., TheMovieDB ID) to look up
   * @param mediaType The media type to match
   * @returns The wallet address of the requester, or undefined if not found
   */
  getRequesterByProviderId(
    providerId: string,
    mediaType: "movie" | "tv",
  ): string | undefined;
  /**
   * Remove a tracked request by its request ID (backward compatibility).
   * @param requestId The request ID to remove
   */
  removeRequest(requestId: string): void;
  /**
   * Remove a tracked request by its provider ID and media type.
   * @param providerId The provider ID to remove
   * @param mediaType The media type to match for removal
   */
  removeRequestByProviderId(
    providerId: string,
    mediaType: "movie" | "tv",
  ): void;
}

/**
 * HTTP server that receives webhook notifications from Ombi and forwards them
 * to users via XMTP. Handles authentication via IP allowlisting and processes
 * media availability and denial notifications.
 */
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

  /**
   * Create a new webhook server instance.
   * @param requestTracker Service for tracking media requests and their requesters
   * @param ombiToken Authentication token for webhook requests (currently unused)
   * @param allowlistedIPs List of IP addresses allowed to send webhook requests
   * @param trustProxy Whether to trust proxy headers for client IP detection
   * @param debugEnabled Whether to enable debug logging of webhook requests
   */
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

  /**
   * Convert an IP address to a 32-bit integer for CIDR comparison
   */
  private ipToInt(ip: string): number {
    return (
      ip
        .split(".")
        .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0
    );
  }

  /**
   * Check if an IP address is within a CIDR range
   */
  private isIPInCIDR(ip: string, cidr: string): boolean {
    if (!cidr.includes("/")) {
      return false; // Not a CIDR notation
    }

    const [network, prefixLength] = cidr.split("/");
    const prefix = parseInt(prefixLength, 10);

    if (prefix < 0 || prefix > 32) {
      return false; // Invalid prefix length
    }

    const networkInt = this.ipToInt(network);
    const ipInt = this.ipToInt(ip);
    const mask = (0xffffffff << (32 - prefix)) >>> 0;

    return (networkInt & mask) === (ipInt & mask);
  }

  /**
   * Extract IPv4 address from IPv4-mapped IPv6 address
   */
  private extractIPv4FromMapped(ipv6: string): string | null {
    if (ipv6.startsWith("::ffff:")) {
      return ipv6.substring(7);
    }
    return null;
  }

  private isValidOmbiRequest(req: express.Request): boolean {
    // Check Access-Token header
    const accessToken = req.headers["access-token"];
    if (!accessToken || accessToken !== this.ombiToken) {
      return false;
    }

    // Check if request comes from an allowlisted IP (where Ombi is running)
    const clientIP =
      req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

    if (!clientIP) {
      return false;
    }

    // Extract IPv4 from IPv4-mapped IPv6 if applicable
    const clientIPv4 = this.extractIPv4FromMapped(clientIP) || clientIP;

    let isAllowlistedIP = false;
    this.allowlistedIPs.forEach((allowlistedIP) => {
      if (isAllowlistedIP) {
        return;
      }

      // Check if allowlisted entry is a CIDR range
      if (allowlistedIP.includes("/")) {
        // CIDR range check - try both original client IP and extracted IPv4
        if (this.isIPInCIDR(clientIPv4, allowlistedIP)) {
          isAllowlistedIP = true;
          return;
        }
        // Also check original IP in case it's IPv4 and we extracted from mapped
        if (
          clientIP !== clientIPv4 &&
          this.isIPInCIDR(clientIP, allowlistedIP)
        ) {
          isAllowlistedIP = true;
          return;
        }
        return;
      }

      // Direct match - check both original IP and extracted IPv4
      if (clientIP === allowlistedIP || clientIPv4 === allowlistedIP) {
        isAllowlistedIP = true;
        return;
      }

      // Handle IPv4-mapped IPv6 addresses in allowlist
      if (allowlistedIP.startsWith("::ffff:")) {
        const allowlistedIPv4 = this.extractIPv4FromMapped(allowlistedIP);
        if (
          allowlistedIPv4 &&
          (clientIP === allowlistedIPv4 || clientIPv4 === allowlistedIPv4)
        ) {
          isAllowlistedIP = true;
          return;
        }
      }
    });

    return isAllowlistedIP;
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
      censoredHeaders.authorization = "***CENSORED***";
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
    const notificationType = payload.notificationType?.toLowerCase() || "";
    return (
      requestStatus === "available" ||
      requestStatus === "denied" ||
      notificationType === "partiallyavailable" ||
      notificationType === "requestapproved"
    );
  }

  private getMediaTypeFromPayload(
    payload: WebhookPayload,
  ): "movie" | "tv" | null {
    const type = payload.type?.toLowerCase();
    if (type === "movie") {
      return "movie";
    } else if (type === "tv" || type === "tvshow" || type === "tv show") {
      return "tv";
    }
    return null;
  }

  private async handleUserNotification(payload: WebhookPayload) {
    if (!payload.providerId || !this.notificationHandler) {
      return;
    }

    const providerId = payload.providerId;
    const mediaType = this.getMediaTypeFromPayload(payload);

    if (!mediaType) {
      console.log(
        `Unable to determine media type from payload for provider ID: ${providerId}`,
      );
      return;
    }

    const requesterAddress = this.requestTracker.getRequesterByProviderId(
      providerId,
      mediaType,
    );

    if (!requesterAddress) {
      console.log(
        `No requester found for provider ID: ${providerId} (${mediaType})`,
      );
      return;
    }

    const mediaTitle = payload.title || "Unknown";
    const requestStatus = payload.requestStatus?.toLowerCase() || "";
    const notificationType = payload.notificationType?.toLowerCase() || "";

    let notificationMessage: string;
    if (requestStatus === "available") {
      notificationMessage = `🎉 Your ${payload.type || "content"} "${mediaTitle}" is now available!`;
    } else if (requestStatus === "denied") {
      const reason = payload.denyReason ? ` Reason: ${payload.denyReason}` : "";
      notificationMessage = `❌ Your request for "${mediaTitle}" has been denied.${reason}`;
    } else if (notificationType === "partiallyavailable") {
      const episodeNumbers = payload.partiallyAvailableEpisodeNumbers || "";
      const seasonNumber = payload.partiallyAvailableSeasonNumber;
      const episodeCount = payload.partiallyAvailableEpisodeCount || 0;

      if (episodeNumbers && seasonNumber !== undefined && episodeCount > 0) {
        const episodeWord = episodeCount === 1 ? "episode" : "episodes";
        notificationMessage = `📺 Some episodes of "${mediaTitle}" are now available! Season ${seasonNumber}, Episodes: ${episodeNumbers} (${episodeCount} ${episodeWord})`;
      } else if (episodeCount > 0) {
        const episodeWord = episodeCount === 1 ? "episode" : "episodes";
        notificationMessage = `📺 Some episodes of "${mediaTitle}" are now available! (${episodeCount} ${episodeWord})`;
      } else {
        notificationMessage = `📺 Some episodes of "${mediaTitle}" are now available!`;
      }
    } else if (notificationType === "requestapproved") {
      notificationMessage = `✅ Your request for "${mediaTitle}" has been approved and is being processed!`;
    } else {
      return; // Shouldn't happen as we check in isNotificationForUser
    }

    try {
      await this.notificationHandler(requesterAddress, notificationMessage);

      // Only remove tracking for final states (available/denied), not for intermediate states (partial availability/approved)
      if (
        notificationType !== "partiallyavailable" &&
        notificationType !== "requestapproved"
      ) {
        this.requestTracker.removeRequestByProviderId(providerId, mediaType);
      }

      let statusOrType: string;
      if (notificationType === "partiallyavailable") {
        statusOrType = "partially available";
      } else if (notificationType === "requestapproved") {
        statusOrType = "approved";
      } else {
        statusOrType = requestStatus;
      }
      console.log(
        `Sent notification to ${requesterAddress} for ${mediaTitle} (${statusOrType})`,
      );
    } catch (error) {
      console.error(
        `Failed to send notification to ${requesterAddress}:`,
        error,
      );
    }
  }

  /**
   * Set the handler function for sending notifications to users.
   * @param handler Function that takes a wallet address and message, sends notification
   */
  public setNotificationHandler(
    handler: (address: string, message: string) => Promise<void>,
  ) {
    this.notificationHandler = handler;
  }

  /**
   * Start the webhook server on the specified port.
   * @param port The port number to listen on (defaults to 3000)
   * @returns Promise that resolves when the server is listening
   */
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

  /**
   * Stop the webhook server gracefully.
   * @returns Promise that resolves when the server has stopped
   */
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
