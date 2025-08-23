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
        eventType: "MediaAvailable",
        requestId: 123,
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
    });

    it("should accept requests with x-application-token header", async () => {
      const payload: WebhookPayload = {
        eventType: "MediaAvailable",
        requestId: 123,
      };

      const response = await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("x-application-token", mockOmbiToken)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(response.body).toEqual({ received: true });
    });

    it("should reject requests from non-allowlisted IP", async () => {
      const payload: WebhookPayload = {
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        subject: 'Movie "The Matrix" is now available',
        message: "Your requested movie is ready for download",
        mediaType: "movie",
        requestId: 123,
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
        "Sent notification to 0x1234567890abcdef for The Matrix",
      );
      expect(mockRequestTracker.hasRequest("123")).toBe(false); // Should be removed after notification
    });

    it("should process availability notification with TV show", async () => {
      const payload: WebhookPayload = {
        eventType: "EpisodeAvailable",
        subject: 'TV Show "Breaking Bad" is now available',
        message: "Your requested episode is ready",
        mediaType: "tv",
        requestId: 123,
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

    it("should extract media title from quoted subject", async () => {
      const payload: WebhookPayload = {
        eventType: "available",
        subject: 'The movie "Inception" has been downloaded successfully',
        requestId: 123,
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your content "Inception" is now available!',
      );
    });

    it("should use subject as fallback when no quoted title found", async () => {
      const payload: WebhookPayload = {
        eventType: "downloaded",
        subject: "Movie Available",
        requestId: 123,
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your content "Movie Available" is now available!',
      );
    });

    it("should use message as fallback when no subject", async () => {
      const payload: WebhookPayload = {
        eventType: "ready",
        message: "Content is ready for viewing",
        requestId: 123,
      };

      await request(server["app"])
        .post("/webhook")
        .send(payload)
        .set("Authorization", `Bearer ${mockOmbiToken}`)
        .set("X-Forwarded-For", "127.0.0.1")
        .expect(200);

      expect(mockNotificationHandler).toHaveBeenCalledWith(
        "0x1234567890abcdef",
        '🎉 Your content "Content is ready for viewing" is now available!',
      );
    });

    it("should use Unknown as fallback when no title info", async () => {
      const payload: WebhookPayload = {
        eventType: "completed",
        requestId: 123,
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

    it("should ignore non-availability notifications", async () => {
      const payload: WebhookPayload = {
        eventType: "RequestApproved",
        subject: "Your request has been approved",
        requestId: 123,
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
        eventType: "MediaAvailable",
        subject: "Some movie is available",
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
        eventType: "MediaAvailable",
        subject: "Unknown movie is available",
        requestId: 999, // Not in tracker
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
        eventType: "MediaAvailable",
        subject: 'Movie "Test Movie" is available',
        requestId: 123,
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

    test.each([
      ["MediaAvailable", true],
      ["DOWNLOADED", true],
      ["ContentReady", true],
      ["TaskCompleted", true],
      ["RequestApproved", false],
      ["UserRegistered", false],
    ])(
      "should detect availability keywords in event type %s",
      async (eventType: string, shouldNotify: boolean) => {
        const payload: WebhookPayload = {
          eventType: eventType,
          subject: "Test Content",
          requestId: 123,
        };

        await request(server["app"])
          .post("/webhook")
          .send(payload)
          .set("Authorization", `Bearer ${mockOmbiToken}`)
          .set("X-Forwarded-For", "127.0.0.1")
          .expect(200);

        if (shouldNotify) {
          expect(mockNotificationHandler).toHaveBeenCalled();
        } else {
          expect(mockNotificationHandler).not.toHaveBeenCalled();
        }
      },
    );

    test.each([
      ["Your movie is now available", undefined, true],
      [undefined, "Download completed successful", true],
      ["Content ready for viewing", undefined, true],
      [undefined, "Media has been downloaded", true],
      ["Request approved", undefined, false],
      [undefined, "Processing started", false],
    ])(
      "should detect availability keywords in subject %s and message %s",
      async (
        subject: string | undefined,
        message: string | undefined,
        shouldNotify: boolean,
      ) => {
        const payload: WebhookPayload = {
          eventType: "TestEvent",
          subject: subject,
          message: message,
          requestId: 123,
        };

        await request(server["app"])
          .post("/webhook")
          .send(payload)
          .set("Authorization", `Bearer ${mockOmbiToken}`)
          .set("X-Forwarded-For", "127.0.0.1")
          .expect(200);

        if (shouldNotify) {
          expect(mockNotificationHandler).toHaveBeenCalled();
        } else {
          expect(mockNotificationHandler).not.toHaveBeenCalled();
        }
      },
    );
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
        eventType: "MediaAvailable",
        requestId: 123,
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
        eventType: "MediaAvailable",
        subject: "Test movie available",
        requestId: 123,
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
});
