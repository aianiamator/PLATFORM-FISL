import type { IncomingHttpHeaders } from "http";
import type { RequestHandler } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { configuredClerkProxyOrigin } from "../lib/origins";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
const MAX_PROXY_RESPONSE_BYTES = 2 * 1024 * 1024;
export const CLERK_PROXY_PATH = "/api/__clerk";

function getRequestHost(req: { headers: IncomingHttpHeaders }): string | undefined {
  const forwarded = req.headers["x-forwarded-host"];
  const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = raw?.split(",")[0]?.trim();
  return firstHop || req.headers.host?.trim() || undefined;
}

export function clerkProxyMiddleware(): RequestHandler {
  if (process.env.NODE_ENV !== "production" || !process.env.CLERK_SECRET_KEY) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    selfHandleResponse: true,
    timeout: 10_000,
    proxyTimeout: 10_000,
    pathRewrite: (path: string) => path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const proxyOrigin = configuredClerkProxyOrigin(getRequestHost(req));
        if (proxyOrigin) proxyReq.setHeader("Clerk-Proxy-Url", `${proxyOrigin}${CLERK_PROXY_PATH}`);
        proxyReq.setHeader("Clerk-Secret-Key", process.env.CLERK_SECRET_KEY!);
        const clientIp = req.socket?.remoteAddress || "";
        if (clientIp) proxyReq.setHeader("X-Forwarded-For", clientIp);
      },
      proxyRes: (proxyRes, req, res) => {
        const headers = { ...proxyRes.headers };
        delete headers["transfer-encoding"];
        delete headers.connection;
        delete headers["keep-alive"];
        const status = proxyRes.statusCode ?? 502;
        if (status < 200 || status === 204) delete headers["content-length"];
        const bodyless = req.method === "HEAD" || status < 200 || status === 204 || status === 304;
        const declaredLength = Number(headers["content-length"]);
        if (Number.isFinite(declaredLength) && declaredLength > MAX_PROXY_RESPONSE_BYTES) {
          proxyRes.destroy();
          res.writeHead(502, { "content-length": "0" });
          res.end();
          return;
        }
        if (headers["content-length"] !== undefined || bodyless) {
          res.writeHead(status, headers);
          proxyRes.on("error", () => res.destroy());
          proxyRes.pipe(res);
          return;
        }
        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        proxyRes.on("data", (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > MAX_PROXY_RESPONSE_BYTES) {
            proxyRes.destroy();
            return;
          }
          chunks.push(chunk);
        });
        proxyRes.on("end", () => {
          if (receivedBytes > MAX_PROXY_RESPONSE_BYTES) {
            if (!res.headersSent) res.writeHead(502, { "content-length": "0" });
            res.end();
            return;
          }
          const body = Buffer.concat(chunks);
          headers["content-length"] = String(body.length);
          res.writeHead(status, headers);
          res.end(body);
        });
        proxyRes.on("error", () => {
          if (!res.headersSent) res.writeHead(502, { "content-length": "0" });
          res.end();
        });
      },
    },
  }) as RequestHandler;
}