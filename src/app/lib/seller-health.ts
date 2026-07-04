// src/app/lib/seller-health.ts
//
// Seller reachability probing + lifecycle status.
//
// Status semantics:
//   active  - reachable, prices shown
//   blocked - bot-walled (Cloudflare etc); scraping still works, prices shown
//   dead    - unreachable (DNS/conn fail); prices HIDDEN until it recovers
//   retired - manually removed from rotation; prices hidden. Never set
//             automatically and never auto-reactivated.
import { query } from "@/lib/sql";

export type SellerHealth = {
  status: "ok" | "blocked" | "down" | "other";
  detail: string;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function probeSellerHealth(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SellerHealth> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetchImpl(baseUrl, {
        redirect: "follow",
        signal: ctl.signal,
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          "Accept-Language": "en-AU,en;q=0.9",
        },
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
    const cf = res.headers.get("cf-mitigated");
    if (cf) return { status: "blocked", detail: `cloudflare:${cf} (${res.status})` };
    if (res.status === 403) return { status: "blocked", detail: "403" };
    if (res.ok || res.status === 202) return { status: "ok", detail: String(res.status) };
    return { status: "other", detail: String(res.status) };
  } catch (e) {
    const detail =
      (e as { cause?: { code?: string } })?.cause?.code ??
      (e as Error)?.name ??
      "conn-fail";
    return { status: "down", detail: String(detail) };
  }
}

/**
 * Reconcile a seller's stored lifecycle status with a fresh health probe.
 * Only flips between active/blocked/dead — 'retired' is manual-only.
 * Returns the (possibly updated) status.
 */
export async function reconcileSellerStatus(
  sellerId: number,
  currentStatus: string | null | undefined,
  health: SellerHealth,
): Promise<string> {
  const current = currentStatus || "active";
  if (current === "retired") return current;

  let next = current;
  if (health.status === "down") next = "dead";
  else if (health.status === "blocked") next = "blocked";
  else if (health.status === "ok") next = "active";
  // 'other' (5xx etc) is treated as transient — leave status alone

  if (next !== current) {
    await query("run", "UPDATE sellers SET status = ? WHERE id = ?", [next, sellerId]);
    console.log(
      `[seller-health] ${sellerId}: ${current} -> ${next} (${health.status}: ${health.detail})`,
    );
  }
  return next;
}
