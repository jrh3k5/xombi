import { RequestTracker } from "../webhook/server";

interface TrackedRequest {
  requestId: string;
  mediaType: "movie" | "tv";
  requesterAddress: string;
  timestamp: Date;
}

export class MemoryRequestTracker implements RequestTracker {
  private requests: Map<string, TrackedRequest> = new Map();

  trackRequest(
    requestId: string,
    mediaType: "movie" | "tv",
    requesterAddress: string,
  ): void {
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

  getRequester(requestId: string): string | undefined {
    // For backward compatibility, try to find a match with any media type
    for (const [, request] of this.requests.entries()) {
      if (request.requestId === requestId) {
        return request.requesterAddress;
      }
    }
    return undefined;
  }

  getRequesterByProviderId(
    providerId: string,
    mediaType: "movie" | "tv",
  ): string | undefined {
    const key = `${providerId}:${mediaType}`;
    const request = this.requests.get(key);
    return request?.requesterAddress;
  }

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

  getTrackedRequestCount(): number {
    return this.requests.size;
  }

  getAllTrackedRequests(): TrackedRequest[] {
    return Array.from(this.requests.values());
  }

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
