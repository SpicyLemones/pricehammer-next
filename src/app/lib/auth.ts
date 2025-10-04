const BASIC_PREFIX = "Basic ";

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

export function isAuthorizedAdmin(authHeader?: string | null): boolean {
  const expectedUser = process.env.ADMIN_USER;
  const expectedPass = process.env.ADMIN_PASS;

  if (!expectedUser || !expectedPass) {
    // When credentials are not configured (e.g. local dev) treat everyone as admin.
    return true;
  }

  if (!authHeader || !authHeader.startsWith(BASIC_PREFIX)) {
    return false;
  }

  const { user, pass } = decodeBasicAuth(authHeader);
  return user === expectedUser && pass === expectedPass;
}
