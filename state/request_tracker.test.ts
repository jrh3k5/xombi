import { MemoryRequestTracker } from "./request_tracker";

describe("MemoryRequestTracker", () => {
  let tracker: MemoryRequestTracker;

  beforeEach(() => {
    tracker = new MemoryRequestTracker();
    // Mock console.log to avoid noise in tests
    jest.spyOn(console, "log").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("trackRequest", () => {
    it("should track a movie request", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");

      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(tracker.getRequester("movie123")).toBe("0x1234567890abcdef");
      expect(console.log).toHaveBeenCalledWith(
        "Tracking movie request movie123 for 0x1234567890abcdef",
      );
    });

    it("should track a TV request", () => {
      tracker.trackRequest("tv456", "tv", "0xfedcba0987654321");

      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(tracker.getRequester("tv456")).toBe("0xfedcba0987654321");
      expect(console.log).toHaveBeenCalledWith(
        "Tracking tv request tv456 for 0xfedcba0987654321",
      );
    });

    it("should track multiple requests", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");
      tracker.trackRequest("tv456", "tv", "0xfedcba0987654321");
      tracker.trackRequest("movie789", "movie", "0x1234567890abcdef");

      expect(tracker.getTrackedRequestCount()).toBe(3);
    });

    it("should support same provider ID with different media types", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");
      tracker.trackRequest("550", "tv", "0xfedcba0987654321");

      expect(tracker.getTrackedRequestCount()).toBe(2);
      expect(tracker.getRequesterByProviderId("550", "movie")).toBe(
        "0x1234567890abcdef",
      );
      expect(tracker.getRequesterByProviderId("550", "tv")).toBe(
        "0xfedcba0987654321",
      );
    });

    it("should automatically call cleanup when tracking requests", () => {
      const cleanupSpy = jest.spyOn(tracker, "cleanup");

      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");

      expect(cleanupSpy).toHaveBeenCalledWith();
      expect(tracker.getTrackedRequestCount()).toBe(1);

      cleanupSpy.mockRestore();
    });
  });

  describe("getRequester", () => {
    it("should return the requester address for existing request", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");

      expect(tracker.getRequester("movie123")).toBe("0x1234567890abcdef");
    });

    it("should return undefined for non-existent request", () => {
      expect(tracker.getRequester("nonexistent")).toBeUndefined();
    });
  });

  describe("removeRequest", () => {
    it("should remove existing request", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");

      expect(tracker.getTrackedRequestCount()).toBe(1);

      tracker.removeRequest("movie123");

      expect(tracker.getTrackedRequestCount()).toBe(0);
      expect(tracker.getRequester("movie123")).toBeUndefined();
      expect(console.log).toHaveBeenCalledWith(
        "Removed tracking for request movie123",
      );
    });

    it("should not log removal for non-existent request", () => {
      tracker.removeRequest("nonexistent");

      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Removed tracking"),
      );
    });
  });

  describe("getTrackedRequestCount", () => {
    it("should return 0 for empty tracker", () => {
      expect(tracker.getTrackedRequestCount()).toBe(0);
    });

    it("should return correct count after adding requests", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");
      tracker.trackRequest("tv456", "tv", "0xfedcba0987654321");

      expect(tracker.getTrackedRequestCount()).toBe(2);
    });

    it("should return correct count after removing requests", () => {
      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");
      tracker.trackRequest("tv456", "tv", "0xfedcba0987654321");
      tracker.removeRequest("movie123");

      expect(tracker.getTrackedRequestCount()).toBe(1);
    });
  });

  describe("getAllTrackedRequests", () => {
    it("should return empty array for empty tracker", () => {
      expect(tracker.getAllTrackedRequests()).toEqual([]);
    });

    it("should return all tracked requests with correct data", () => {
      const now = new Date();
      jest.useFakeTimers().setSystemTime(now);

      tracker.trackRequest("movie123", "movie", "0x1234567890abcdef");
      tracker.trackRequest("tv456", "tv", "0xfedcba0987654321");

      const requests = tracker.getAllTrackedRequests();

      expect(requests).toHaveLength(2);
      expect(requests).toContainEqual({
        requestId: "movie123",
        mediaType: "movie",
        requesterAddress: "0x1234567890abcdef",
        timestamp: now,
      });
      expect(requests).toContainEqual({
        requestId: "tv456",
        mediaType: "tv",
        requesterAddress: "0xfedcba0987654321",
        timestamp: now,
      });

      jest.useRealTimers();
    });
  });

  describe("cleanup", () => {
    it("should remove requests older than specified days", () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000); // 20 days ago

      // Mock the timestamps by setting system time
      jest.useFakeTimers();

      // Add old request
      jest.setSystemTime(oldDate);
      tracker.trackRequest("old123", "movie", "0x1234567890abcdef");

      // Add recent request
      jest.setSystemTime(recentDate);
      tracker.trackRequest("recent456", "tv", "0xfedcba0987654321");

      // Set current time and cleanup
      jest.setSystemTime(now);
      tracker.cleanup(30);

      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(tracker.getRequester("old123")).toBeUndefined();
      expect(tracker.getRequester("recent456")).toBe("0xfedcba0987654321");
      expect(console.log).toHaveBeenCalledWith(
        "Cleaned up 1 old tracked requests",
      );

      jest.useRealTimers();
    });

    it("should use default 30 days when no parameter provided", () => {
      const now = new Date();
      const oldDate = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);

      jest.useFakeTimers();
      jest.setSystemTime(oldDate);
      tracker.trackRequest("old123", "movie", "0x1234567890abcdef");

      jest.setSystemTime(now);
      tracker.cleanup(); // No parameter, should default to 30 days

      expect(tracker.getTrackedRequestCount()).toBe(0);
      expect(console.log).toHaveBeenCalledWith(
        "Cleaned up 1 old tracked requests",
      );

      jest.useRealTimers();
    });

    it("should not log when no requests are cleaned up", () => {
      const now = new Date();
      const recentDate = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);

      jest.useFakeTimers();
      jest.setSystemTime(recentDate);
      tracker.trackRequest("recent456", "tv", "0xfedcba0987654321");

      jest.setSystemTime(now);
      tracker.cleanup(30);

      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Cleaned up"),
      );

      jest.useRealTimers();
    });

    it("should handle empty tracker during cleanup", () => {
      tracker.cleanup(30);

      expect(tracker.getTrackedRequestCount()).toBe(0);
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Cleaned up"),
      );
    });
  });

  describe("getRequesterByProviderId", () => {
    it("should return requester for existing provider ID and media type", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");
      tracker.trackRequest("551", "tv", "0xfedcba0987654321");

      expect(tracker.getRequesterByProviderId("550", "movie")).toBe(
        "0x1234567890abcdef",
      );
      expect(tracker.getRequesterByProviderId("551", "tv")).toBe(
        "0xfedcba0987654321",
      );
    });

    it("should return undefined for non-existent provider ID", () => {
      expect(tracker.getRequesterByProviderId("999", "movie")).toBeUndefined();
    });

    it("should return undefined for wrong media type", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");

      expect(tracker.getRequesterByProviderId("550", "tv")).toBeUndefined();
    });

    it("should support multiple requests for same provider ID with different media types", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");
      tracker.trackRequest("550", "tv", "0xfedcba0987654321");

      expect(tracker.getRequesterByProviderId("550", "movie")).toBe(
        "0x1234567890abcdef",
      );
      expect(tracker.getRequesterByProviderId("550", "tv")).toBe(
        "0xfedcba0987654321",
      );
    });
  });

  describe("removeRequestByProviderId", () => {
    it("should remove request by provider ID and media type", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");
      tracker.trackRequest("551", "tv", "0xfedcba0987654321");

      tracker.removeRequestByProviderId("550", "movie");

      expect(tracker.getRequesterByProviderId("550", "movie")).toBeUndefined();
      expect(tracker.getRequesterByProviderId("551", "tv")).toBe(
        "0xfedcba0987654321",
      );
      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(console.log).toHaveBeenCalledWith(
        "Removed tracking for movie provider ID 550",
      );
    });

    it("should not remove request with wrong media type", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");

      tracker.removeRequestByProviderId("550", "tv");

      expect(tracker.getRequesterByProviderId("550", "movie")).toBe(
        "0x1234567890abcdef",
      );
      expect(tracker.getTrackedRequestCount()).toBe(1);
    });

    it("should handle non-existent provider ID gracefully", () => {
      tracker.removeRequestByProviderId("999", "movie");

      expect(tracker.getTrackedRequestCount()).toBe(0);
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining("Removed tracking for"),
      );
    });

    it("should remove exact provider ID and media type match", () => {
      tracker.trackRequest("550", "movie", "0x1234567890abcdef");
      tracker.trackRequest("550", "tv", "0xfedcba0987654321"); // Different media type

      tracker.removeRequestByProviderId("550", "movie");

      // Should have removed only the movie, leaving the TV request
      expect(tracker.getTrackedRequestCount()).toBe(1);
      expect(tracker.getRequesterByProviderId("550", "movie")).toBeUndefined();
      expect(tracker.getRequesterByProviderId("550", "tv")).toBe(
        "0xfedcba0987654321",
      );
      expect(console.log).toHaveBeenCalledWith(
        "Removed tracking for movie provider ID 550",
      );
    });
  });
});
