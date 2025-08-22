import { RequestTracker } from '../webhook/server';

interface TrackedRequest {
  requestId: string;
  mediaType: 'movie' | 'tv';
  requesterAddress: string;
  timestamp: Date;
}

export class MemoryRequestTracker implements RequestTracker {
  private requests: Map<string, TrackedRequest> = new Map();

  trackRequest(requestId: string, mediaType: 'movie' | 'tv', requesterAddress: string): void {
    const request: TrackedRequest = {
      requestId,
      mediaType,
      requesterAddress,
      timestamp: new Date(),
    };
    
    this.requests.set(requestId, request);
    console.log(`Tracking ${mediaType} request ${requestId} for ${requesterAddress}`);
  }

  getRequester(requestId: string): string | undefined {
    const request = this.requests.get(requestId);
    return request?.requesterAddress;
  }

  removeRequest(requestId: string): void {
    const removed = this.requests.delete(requestId);
    if (removed) {
      console.log(`Removed tracking for request ${requestId}`);
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