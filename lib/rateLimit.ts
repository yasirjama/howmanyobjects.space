type RateLimitInfo = {
  count: number;
  expires: number;
};

// Simple in-memory tracker (persists across warm invocations in serverless environments)
const ipCache = new Map<string, RateLimitInfo>();

/**
 * Checks if a given IP has exceeded the allowed number of requests per window.
 * @param ip IP address of the requester (fallback to 'unknown' if not present)
 * @param limit Max requests allowed in the window
 * @param windowMs Window duration in milliseconds
 * @returns true if allowed, false if rate limited
 */
export function isAllowed(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const info = ipCache.get(ip);

  // If new IP or expired window, reset and allow
  if (!info || info.expires < now) {
    ipCache.set(ip, { count: 1, expires: now + windowMs });
    return true;
  }

  // If within window but over limit, block
  if (info.count >= limit) {
    return false;
  }

  // Otherwise, increment and allow
  info.count++;
  return true;
}

// Optional utility to clean up dead entries from memory occasionally
export function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of ipCache.entries()) {
    if (value.expires < now) {
      ipCache.delete(key);
    }
  }
}

// Run cleanup occasionally
setInterval(cleanupCache, 60000);
