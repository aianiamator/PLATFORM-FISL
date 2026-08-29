import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import { configuredAppOrigins, isTrustedOrigin } from "./lib/origins";
import { rateLimit } from "./middlewares/rateLimit";

const app: Express = express();
app.disable("x-powered-by");

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});
app.use(cors((req, callback) => {
  const origin = req.header("origin");
  if (!origin) {
    callback(null, { credentials: true, origin: false });
    return;
  }

  const allowed = isTrustedOrigin(origin);
  callback(null, { credentials: true, origin: allowed ? origin : false });
}));
app.use((req, res, next) => {
  const origin = req.header("origin");
  if (origin && !isTrustedOrigin(origin)) {
    res.status(403).json({ error: "Untrusted request origin" });
    return;
  }
  next();
});
app.use(
  CLERK_PROXY_PATH,
  rateLimit({ name: "clerk-proxy", windowMs: 60_000, max: 120 }),
  clerkProxyMiddleware(),
);
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true, limit: "32kb" }));
app.use(clerkMiddleware());

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
}, router);

export default app;
