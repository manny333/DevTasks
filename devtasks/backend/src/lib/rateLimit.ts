import type { Request, Response, NextFunction, RequestHandler } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Maximum requests allowed per window. */
  max: number;
  /** Bucket key; defaults to the client IP. */
  key?: (req: Request) => string;
  message?: string;
}

/**
 * Minimal in-process rate limiter (fixed window). Good enough for a
 * single-instance deployment; swap for Redis if the API is scaled out.
 */
export function rateLimit(opts: RateLimitOptions): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();

    // Opportunistic cleanup so the map cannot grow without bound.
    if (buckets.size > 10_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const key = opts.key ? opts.key(req) : `ip:${req.ip ?? 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + opts.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    if (bucket.count > opts.max) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: opts.message ?? 'Too many requests' });
      return;
    }

    next();
  };
}
