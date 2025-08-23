import request from "supertest";
import { WebhookServer, WebhookPayload, RequestTracker } from "./server";

// Mock request tracker implementation for testing
class MockRequestTracker implements RequestTracker {
  private requests: Map<string, string> = new Map();

  trackRequest(
    requestId: string,
    mediaType: "movie" | "tv",
    requesterAddress: string,
  ): void {
    this.requests.set(requestId, requesterAddress);
  }

  getRequester(requestId: string): string | undefined {
    return this.requests.get(requestId);
  }

  removeRequest(requestId: string): void {
    this.requests.delete(requestId);
  }

  // Helper method for tests
  setRequester(requestId: string, address: string): void {
    this.requests.set(requestId, address);
  }

  hasRequest(requestId: string): boolean {
    return this.requests.has(requestId);
  }
}

describe("WebhookServer", () => {
  let server: WebhookServer;
  let mockRequestTracker: MockRequestTracker;
  let mockNotificationHandler: jest.Mock;
  const mockOmbiToken = "test-ombi-token";
  const mockAllowlistedIPs = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

  beforeEach(() => {
    mockRequestTracker = new MockRequestTracker();
    mockNotificationHandler = jest.fn().mockResolvedValue(undefined);
    // Trust proxy so that the X-Forwarded-For header is honored by Express
    server = new WebhookServer(
      mockRequestTracker,
      mockOmbiToken,
      mockAllowlistedIPs,
      true,
    );
    server.setNotificationHandler(mockNotificationHandler);

    // Mock console methods
    jest.spyOn(console, "log").mockImplementation();
    jest.spyOn(console, "error").mockImplementation();
  });

  afterEach(async () => {
    await server.stop();
    jest.restoreAllMocks();
  });

  describe("middleware and security", () => {
    it("should accept requests from allowlisted IP with valid token", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
    });

    it("should accept requests with access-token header", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("access-token", mockOmbiToken)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
    });

    it("should reject requests from non-allowlisted IP", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "192.168.1.100") // Not in allowlist
        .expect(403);

      expect(response.body).toEqual({ error: "Forbidden" });
      expect(console.log).toHaveBeenCalledWith(
        "Rejected unauthorized webhook request from:",
        expect.any(String),
      );
    });

    it("should reject requests with invalid token", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", "Bearer invalid-token")
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(403);

      expect(response.body).toEqual({ error: "Forbidden" });
    });

    it("should reject requests without token", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(403);

      expect(response.body).toEqual({ error: "Forbidden" });
    });

    it("should accept IPv4-mapped IPv6 requests when IPv4 is allowlisted", async () => {
      // Create a server with a specific IPv4 address in the allowlist
      const testServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        ["192.168.4.3"], // Only IPv4 address in allowlist
        true,
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(testServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "::ffff:192.168.4.3") // IPv4-mapped IPv6
        .expect(200);

      expect(response.body).toEqual({ received: true });

      await testServer.stop();
    });

    it("should accept IPv4 requests when IPv4-mapped IPv6 is allowlisted", async () => {
      // Create a server with IPv4-mapped IPv6 address in the allowlist
      const testServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        ["::ffff:192.168.4.3"], // IPv4-mapped IPv6 in allowlist
        true,
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(testServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "192.168.4.3") // Regular IPv4
        .expect(200);

      expect(response.body).toEqual({ received: true });

      await testServer.stop();
    });
  });

  describe("health endpoint", () => {
    it("should return health status", async () => {
      const response = await request(server["app"]).get("/health").expect(200);

      expect(response.body).toEqual({
        status: "ok",
        timestamp: expect.any(String),
      });
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe("webhook payload processing", () => {
    beforeEach(() => {
      // Set up mock request in tracker
      mockRequestTracker.setRequester("123", "0x1234567890abcdef");
    });

    it("should process availability notification with movie", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        title: "The Matrix",
        type: "movie",
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your movie "The Matrix" is now available!',
      );
      expect(console.log).toHaveBeenCalledWith(
        "Sent notification to 0x1234567890abcdef for The Matrix (available)",
      );
      expect(mockRequestTracker.hasRequest("123")).toBe(false); // Should be removed after notification
    });

    it("should process availability notification with TV show", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        title: "Breaking Bad",
        type: "tv",
        requestStatus: "Available",
        notificationType: "EpisodeAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your tv "Breaking Bad" is now available!',
      );
    });

    it("should process denied notification", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        title: "Denied Movie",
        type: "movie",
        requestStatus: "Denied",
        denyReason: "Quality not available",
        notificationType: "RequestDenied",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '❌ Your request for "Denied Movie" has been denied. Reason: Quality not available',
      );
      expect(console.log).toHaveBeenCalledWith(
        "Sent notification to 0x1234567890abcdef for Denied Movie (denied)",
      );
      expect(mockRequestTracker.hasRequest("123")).toBe(false); // Should be removed after notification
    });

    it("should use Unknown as fallback when no title provided", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your content "Unknown" is now available!',
      );
    });

    it("should ignore non-user notifications", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "ProcessingRequest",
        notificationType: "RequestProcessing",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).not.toHaveBeenCalled();
      expect(mockRequestTracker.hasRequest("123")).toBe(true); // Should not be removed
    });

    it("should ignore notifications without request ID", async () => {
      const payload: WebhookPayload = {
        requestStatus: "Available",
        title: "Some movie",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).not.toHaveBeenCalled();
    });

    it("should ignore notifications for unknown request ID", async () => {
      const payload: WebhookPayload = {
        requestId: 999, // Not in tracker
        requestStatus: "Available",
        title: "Unknown movie",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        "No requester found for request ID: 999",
      );
    });

    it("should handle notification handler error", async () => {
      mockNotificationHandler.mockRejectedValue(new Error("XMTP send failed"));

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        title: "Test Movie",
        type: "movie",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(console.error).toHaveBeenCalledWith(
        "Failed to send notification to 0x1234567890abcdef:",
        expect.any(Error),
      );
      expect(mockRequestTracker.hasRequest("123")).toBe(true); // Should not be removed on error
    });

    it("should notify for Available status", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        title: "Test Content",
        notificationType: "MediaAvailable",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalled();
    });

    it("should notify for Denied status", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Denied",
        title: "Test Content",
        notificationType: "RequestDenied",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalled();
    });

    it("should not notify for PendingApproval status", async () => {
      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "PendingApproval",
        title: "Test Content",
        notificationType: "RequestPending",
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).not.toHaveBeenCalled();
    });
  });

  describe("test notifications", () => {
    it("should handle test notifications with success message", async () => {
      const payload: WebhookPayload = {
        notificationType: "test",
        title: "Webhook test",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
      expect(console.log).toHaveBeenCalledWith(
        "🎉 Webhook test notification received successfully!",
      );
      expect(mockNotificationHandler).not.toHaveBeenCalled(); // Should not send XMTP notification
    });

    it("should handle test notifications with case insensitive notificationType", async () => {
      const payload: WebhookPayload = {
        notificationType: "TEST", // uppercase
        title: "Webhook test",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
      expect(console.log).toHaveBeenCalledWith(
        "🎉 Webhook test notification received successfully!",
      );
    });
  });

  describe("error handling", () => {
    it("should handle invalid JSON payload", async () => {
      await request(server["app"])
        .post("/webhook")
        .send("invalid json")
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .set("Content-Type", "application/json")
        .expect(400);

      // Express will handle the JSON parsing error before our handler
    });

    it("should handle webhook processing error", async () => {
      // Mock console.log to throw error
      const originalLog = console.log;
      jest.spyOn(console, "log").mockImplementation(() => {
        throw new Error("Logging error");
      });

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(500);

      expect(response.body).toEqual({ error: "Internal server error" });
      expect(console.error).toHaveBeenCalledWith(
        "Error handling webhook:",
        expect.any(Error),
      );

      // Restore original console.log
      console.log = originalLog;
    });
  });

  describe("server lifecycle", () => {
    it("should start server on specified port", async () => {
      const testServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
      );

      await testServer.start(0); // Use port 0 to get available port
      expect(console.log).toHaveBeenCalledWith(
        expect.stringMatching(/Webhook server running on port \d+/),
      );

      await testServer.stop();
    });

    it("should stop server gracefully", async () => {
      const testServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
      );

      await testServer.start(0);
      await testServer.stop();

      expect(console.log).toHaveBeenCalledWith("Webhook server stopped");
    });

    it("should handle stop when server not running", async () => {
      const testServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
      );

      // Should not throw error
      await testServer.stop();
    });
  });

  describe("setNotificationHandler", () => {
    it("should work without notification handler set", async () => {
      const serverWithoutHandler = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
      );
      mockRequestTracker.setRequester("123", "0x1234567890abcdef");

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        title: "Test movie",
        notificationType: "MediaAvailable",
      };

      const response = await request(serverWithoutHandler["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
      // Should not crash, just not send notification
    });
  });

  describe("debug logging", () => {
    it("should log detailed debug information when debug is enabled", async () => {
      const debugServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
        true, // trustProxy
        true, // debugEnabled
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(debugServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("access-token", "another-token")
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(console.log).toHaveBeenCalledWith("=== WEBHOOK DEBUG ===");
      expect(console.log).toHaveBeenCalledWith(
        "Headers:",
        expect.stringContaining("***CENSORED***"),
      );
      expect(console.log).toHaveBeenCalledWith(
        "Body:",
        JSON.stringify(payload, null, 2),
      );
      expect(console.log).toHaveBeenCalledWith("=====================");

      await debugServer.stop();
    });

    it("should censor authorization tokens in debug headers", async () => {
      const debugServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
        true, // trustProxy
        true, // debugEnabled
      );

      const censorHeaders = debugServer["censorHeaders"];
      const headers = {
        authorization: "Bearer secret-token-123",
        "access-token": "another-secret-456",
        "content-type": "application/json",
      };

      const censored = censorHeaders(headers);

      expect(censored.authorization).toBe("Bearer ***CENSORED***");
      expect(censored["access-token"]).toBe("***CENSORED***");
      expect(censored["content-type"]).toBe("application/json");

      await debugServer.stop();
    });

    it("should not log webhook details when debug is disabled", async () => {
      const normalServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
        true, // trustProxy
        false, // debugEnabled
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(normalServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(console.log).not.toHaveBeenCalledWith("=== WEBHOOK DEBUG ===");
      expect(console.log).not.toHaveBeenCalledWith(
        "Received webhook:",
        expect.any(String),
      );

      await normalServer.stop();
    });

    it("should not log webhook details when debug is not specified (defaults to false)", async () => {
      const normalServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        mockAllowlistedIPs,
        true, // trustProxy
        // debugEnabled parameter omitted - should default to false
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(normalServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(console.log).not.toHaveBeenCalledWith("=== WEBHOOK DEBUG ===");
      expect(console.log).not.toHaveBeenCalledWith(
        "Received webhook:",
        expect.any(String),
      );

      await normalServer.stop();
    });

    it("should log debug information even for rejected requests", async () => {
      const debugServer = new WebhookServer(
        mockRequestTracker,
        mockOmbiToken,
        ["192.168.1.100"], // Different allowlisted IP to cause rejection
        true, // trustProxy
        true, // debugEnabled
      );

      const payload: WebhookPayload = {
        requestId: 123,
        requestStatus: "Available",
        notificationType: "MediaAvailable",
      };

      await request(debugServer["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1") // This will be rejected
        .expect(403);

      // Debug logs should still appear even for rejected requests
      expect(console.log).toHaveBeenCalledWith("=== WEBHOOK DEBUG ===");
      expect(console.log).toHaveBeenCalledWith(
        "Headers:",
        expect.stringContaining("***CENSORED***"),
      );
      expect(console.log).toHaveBeenCalledWith(
        "Body:",
        JSON.stringify(payload, null, 2),
      );
      expect(console.log).toHaveBeenCalledWith("=====================");

      await debugServer.stop();
    });
  });
});
