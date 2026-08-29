function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function configuredAppOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const value of (process.env.APP_ORIGINS ?? "").split(",")) {
    const origin = normalizeOrigin(value.trim());
    if (origin) origins.add(origin);
  }

  const replitDomains = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS ?? "").split(","),
  ];
  for (const domain of replitDomains) {
    const host = domain?.trim();
    if (!host) continue;
    const origin = normalizeOrigin(host.includes("://") ? host : `https://${host}`);
    if (origin) origins.add(origin);
  }
  return origins;
}

export function configuredClerkProxyOrigin(requestHost?: string): string | null {
  const explicit = process.env.CLERK_PROXY_ORIGIN?.trim();
  if (explicit) return normalizeOrigin(explicit);

  const origins = [...configuredAppOrigins()];
  if (requestHost) {
    const normalizedHost = requestHost.toLowerCase();
    const matchingOrigin = origins.find((origin) => new URL(origin).host.toLowerCase() === normalizedHost);
    if (matchingOrigin) return matchingOrigin;
  }
  return origins[0] ?? null;
}

export function isTrustedOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  return normalized !== null && configuredAppOrigins().has(normalized);
}