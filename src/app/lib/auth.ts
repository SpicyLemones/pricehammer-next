import { createHmac, timingSafeEqual } from "crypto";

const BASIC_PREFIX = "Basic ";
export const SESSION_COOKIE = "ph_admin";

function sessionKey(): string | null {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;
  if (!user || !pass) return null;
  return `${user}:${pass}:ph-session-v1`;
}

/** Create a signed session token: "<expiryMs>.<hmac>" */
export function createSessionToken(maxAgeMs = 7 * 24 * 60 * 60 * 1000): string | null {
  const key = sessionKey();
  if (!key) return null;
  const expires = Date.now() + maxAgeMs;
  const sig = createHmac("sha256", key).update(`admin:${expires}`).digest("hex");
  return `${expires}.${sig}`;
}

export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const key = sessionKey();
  if (!key) return true; // no creds configured -> open (matches Basic behaviour)
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const expires = Number(token.slice(0, dot));
  if (!Number.isFinite(expires) || expires < Date.now()) return false;
  const expected = createHmac("sha256", key).update(`admin:${expires}`).digest("hex");
  const given = token.slice(dot + 1);
  try {
    return (
      given.length === expected.length &&
      timingSafeEqual(Buffer.from(given, "hex"), Buffer.from(expected, "hex"))
    );
  } catch {
    return false;
  }
}

function sessionFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=");
  }
  return null;
}

function decodeBasicAuth(auth: string) {
  try {
    const base64 = auth.slice(BASIC_PREFIX.length);
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return { user: "", pass: "" };
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);
    return { user, pass };
  } catch {
    return { user: "", pass: "" };
  }
}

export function isAuthorizedAdmin(
  authHeader?: string | null,
  cookieHeader?: string | null,
): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    // When credentials are not configured (e.g. local dev) treat everyone as admin.
    return true;
  }

  // session cookie (browser login)
  if (verifySessionToken(sessionFromCookieHeader(cookieHeader))) {
    return true;
  }

  // Basic Auth (curl, scheduled jobs)
  if (!authHeader || !authHeader.startsWith(BASIC_PREFIX)) {
    return false;
  }

  const { user, pass } = decodeBasicAuth(authHeader);
  return user === expectedUser && pass === expectedPass;
}

/** Convenience for route handlers: checks both auth mechanisms from a Request. */
export function isAdminRequest(req: Request): boolean {
  return isAuthorizedAdmin(req.headers.get("authorization"), req.headers.get("cookie"));
}

export function verifyCredentials(user: string, pass: string): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;
  if (!expectedUser || !expectedPass) return true;
  return user === expectedUser && pass === expectedPass;
}

export function extractAdminIdentity(authHeader?: string | null): { user: string | null } {
  if (!authHeader || !authHeader.startsWith(BASIC_PREFIX)) {
    return { user: null };
  }

  const { user } = decodeBasicAuth(authHeader);
  const trimmed = typeof user === "string" ? user.trim() : "";
  return { user: trimmed || null };
}
