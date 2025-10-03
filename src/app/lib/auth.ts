import { Buffer } from "node:buffer";
import { headers } from "next/headers";

export function isAdminRequest(): boolean {
  const USER = process.env.ADMIN_USER;
  const PASS = process.env.ADMIN_PASS;

  if (!USER || !PASS) {
    // When credentials aren't configured (e.g. local dev), treat everyone as admin
    return true;
  }

  try {
    const headerList = headers();
    const auth = headerList.get("authorization");
    if (!auth || !auth.startsWith("Basic ")) {
      return false;
    }
    const decoded = Buffer.from(auth.slice(6), "base64").toString("utf8");
    const [user, pass] = decoded.split(":");
    return user === USER && pass === PASS;
  } catch {
    return false;
  }
}
