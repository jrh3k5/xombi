import { RequestTracker } from "../webhook/server.js";

/**
 * Internal structure representing a tracked media request.
 */
interface TrackedRequest {
  requestId: string;
  mediaType: "movie" | "tv";
  requesterAddress: string;
  timestamp: Date;
}

/**
 * In-memory implementation of RequestTracker that stores tracked requests
 * in a Map with composite keys to support multiple media types per provider ID.
 * Includes automatic cleanup functionality for old requests.
 */
export class MemoryRequestTracker implements RequestTracker {
  private requests: Map<string, TrackedRequest> = new Map();

  /**
   * Track a media request by its provider ID, associating it with a requester address.
   * Uses composite keys to support the same provider ID for different media types.
   * Automatically cleans up old requests when adding new ones.
   * @param requestId The provider ID (e.g., TheMovieDB ID) of the requested media
   * @param mediaType The type of media being requested (movie or tv)
   * @param requesterAddress The wallet address of the user making the request
   */
  trackRequest(
    requestId: string,
    mediaType: "movie" | "tv",
    requesterAddress: string,
  ): void {
    // Clean up old requests before adding new one
    this.cleanup();

    const request: TrackedRequest = {
      requestId,
      mediaType,
      requesterAddress,
      timestamp: new Date(),
    };

    // Use composite key to support same provider ID with different media types
    const key = `${requestId}:${mediaType}`;
    this.requests.set(key, request);
    console.log(
      `Tracking ${mediaType} request ${requestId} for ${requesterAddress}`,
    );
  }

  /**
   * Get the requester address for a given request ID (backward compatibility).
   * Searches through all tracked requests to find the first match by request ID.
   * @param requestId The request ID to look up
   * @returns The wallet address of the requester, or undefined if not found
   */
  getRequester(requestId: string): string | undefined {
    // For backward compatibility, try to find a match with any media type
    for (const [, request] of this.requests.entries()) {
      if (request.requestId === requestId) {
        return request.requesterAddress;
      }
    }
    return undefined;
  }

  /**
   * Get the requester address for a given provider ID and media type.
   * Uses composite key lookup for efficient retrieval.
   * @param providerId The provider ID (e.g., TheMovieDB ID) to look up
   * @param mediaType The media type to match
   * @returns The wallet address of the requester, or undefined if not found
   */
  getRequesterByProviderId(
    providerId: string,
    mediaType: "movie" | "tv",
  ): string | undefined {
    const key = `${providerId}:${mediaType}`;
    const request = this.requests.get(key);
    return request?.requesterAddress;
  }

  /**
   * Remove a tracked request by its request ID (backward compatibility).
   * Searches through all requests and removes the first match found.
   * @param requestId The request ID to remove
   */
  removeRequest(requestId: string): void {
    let removed = false;
    // Remove all requests with this requestId (any media type)
    for (const [key, request] of this.requests.entries()) {
      if (request.requestId === requestId) {
        this.requests.delete(key);
        removed = true;
        break; // Only remove first match for backward compatibility
      }
    }
    if (removed) {
      console.log(`Removed tracking for request ${requestId}`);
    }
  }

  /**
   * Remove a tracked request by its provider ID and media type.
   * Uses composite key for efficient removal.
   * @param providerId The provider ID to remove
   * @param mediaType The media type to match for removal
   */
  removeRequestByProviderId(
    providerId: string,
    mediaType: "movie" | "tv",
  ): void {
    const key = `${providerId}:${mediaType}`;
    const removed = this.requests.delete(key);

    if (removed) {
      console.log(
        `Removed tracking for ${mediaType} provider ID ${providerId}`,
      );
    }
  }

  /**
   * Get the total number of currently tracked requests.
   * @returns The number of tracked requests
   */
  getTrackedRequestCount(): number {
    return this.requests.size;
  }

  /**
   * Get all currently tracked requests.
   * @returns Array of all tracked request objects
   */
  getAllTrackedRequests(): TrackedRequest[] {
    return Array.from(this.requests.values());
  }

  /**
   * Remove requests older than the specified number of days.
   * Useful for preventing memory leaks from abandoned requests.
   * @param olderThanDays Number of days after which requests should be removed (default: 30)
   */
  cleanup(olderThanDays: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;
    for (const [requestId, request] of this.requests.entries()) {
      if (request.timestamp < cutoffDate) {
        this.requests.delete(requestId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned up ${cleanedCount} old tracked requests`);
    }
  }
}
