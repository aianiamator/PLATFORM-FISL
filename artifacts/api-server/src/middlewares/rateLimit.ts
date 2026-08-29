import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 60_000);
cleanup.unref();

export function rateLimit({
  name,
  windowMs,
  max,
}: {
  name: string;
  windowMs: number;
  max: number;
}): RequestHandler {
  return (req, res, next) => {
    let userId: string | null = null;
    try {
      userId = getAuth(req).userId;
    } catch {
      userId = null;
    }
    const identity = userId ?? req.socket.remoteAddress ?? "unknown";
    const key = `${name}:${identity}`;
    const now = Date.now();
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: current.count + 1, resetAt: current.resetAt };
    buckets.set(key, bucket);

    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))));
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };
}