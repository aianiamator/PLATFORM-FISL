const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";
const TOKEN_TTL_SECONDS = 5 * 60;
const REQUEST_TIMEOUT_MS = 8_000;
const STREAM_UID = /^[a-f0-9]{32}$/i;

export class VideoProviderNotConfiguredError extends Error {
  constructor() {
    super("Cloudflare Stream is not configured");
    this.name = "VideoProviderNotConfiguredError";
  }
}

export class VideoProviderRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoProviderRequestError";
  }
}

type CloudflareTokenResponse = {
  success?: boolean;
  result?: {
    token?: string;
  };
};

type CloudflareMutationResponse = {
  success?: boolean;
};

function getCloudflareConfig(): { accountId: string; apiToken: string; customerCode: string } {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const customerCode = process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE?.trim();

  if (!accountId || !apiToken || !customerCode) {
    throw new VideoProviderNotConfiguredError();
  }
  if (!/^[a-f0-9]{32}$/i.test(accountId)) {
    throw new VideoProviderNotConfiguredError();
  }
  if (!/^[a-z0-9-]+$/i.test(customerCode.replace(/^customer-/, ""))) {
    throw new VideoProviderNotConfiguredError();
  }

  return { accountId, apiToken, customerCode };
}

function validateExternalId(externalId: string): string {
  const normalized = externalId.trim();
  if (!STREAM_UID.test(normalized)) {
    throw new VideoProviderRequestError("Invalid Cloudflare Stream video ID");
  }
  return normalized;
}

async function cloudflareFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new VideoProviderRequestError("Cloudflare Stream request timed out");
  }
}

export async function ensureCloudflareStreamVideoProtected(externalId: string): Promise<void> {
  const { accountId, apiToken } = getCloudflareConfig();
  const videoId = validateExternalId(externalId);
  const response = await cloudflareFetch(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/stream/${encodeURIComponent(videoId)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requireSignedURLs: true }),
    },
  );

  if (!response.ok) {
    throw new VideoProviderRequestError(`Cloudflare Stream returned HTTP ${response.status}`);
  }

  const payload = await response.json() as CloudflareMutationResponse;
  if (!payload.success) {
    throw new VideoProviderRequestError("Cloudflare Stream did not protect the video");
  }
}

export async function createCloudflareStreamPlaybackToken(externalId: string): Promise<{
  playbackUrl: string;
  expiresAt: Date;
}> {
  const { accountId, apiToken, customerCode } = getCloudflareConfig();
  const videoId = validateExternalId(externalId);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);
  const response = await cloudflareFetch(
    `${CLOUDFLARE_API_BASE}/accounts/${encodeURIComponent(accountId)}/stream/${encodeURIComponent(videoId)}/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ exp: Math.floor(expiresAt.getTime() / 1000) }),
    },
  );

  if (!response.ok) {
    throw new VideoProviderRequestError(`Cloudflare Stream returned HTTP ${response.status}`);
  }

  const payload = await response.json() as CloudflareTokenResponse;
  const token = payload.result?.token;
  if (!payload.success || !token || !/^[A-Za-z0-9._~-]+$/.test(token)) {
    throw new VideoProviderRequestError("Cloudflare Stream did not return a playback token");
  }

  const customerHostname = customerCode.startsWith("customer-")
    ? `${customerCode}.cloudflarestream.com`
    : `customer-${customerCode}.cloudflarestream.com`;

  return {
    playbackUrl: `https://${customerHostname}/${token}/iframe`,
    expiresAt,
  };
}