/**
 * Simple in-memory rate limiter (per-process). Good enough for single-node Docker.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export type RateLimitOptions = {
  /** Max attempts inside the window */
  limit: number;
  /** Window length in ms */
  windowMs: number;
};

export class RateLimitError extends Error {
  retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super("محاولات كثيرة — حاول لاحقاً");
    this.name = "RateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k);
  }
}

/** Throws RateLimitError when over limit. */
export function assertRateLimit(key: string, opts: RateLimitOptions): void {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + opts.windowMs });
    return;
  }
  existing.count += 1;
  if (existing.count > opts.limit) {
    throw new RateLimitError(Math.max(1, Math.ceil((existing.resetAt - now) / 1000)));
  }
}

export function clientIp(req: { headers: Record<string, unknown>; socket?: { remoteAddress?: string } }): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return String(xf[0]).split(",")[0]!.trim();
  return req.socket?.remoteAddress || "unknown";
}
