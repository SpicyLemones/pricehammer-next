// src/app/api/auto-validate/route.ts
//
// Re-decide price pairs from the saved store listings (see listings.ts):
//   - SKU match, or a clear name match >= 85%   -> accepted
//   - store's catalogue has nothing like it      -> marked not stocked
//   - anything in between                        -> left for /tinder, with a reason
// Stores whose listings are over a day old are re-synced first.
//
// Params (query string or JSON body):
//   seller  - only this seller id
//   dryRun  - "1"/"true": report what would change, write nothing
//   async   - run in the background; poll GET ?job=<id>
import { NextResponse } from "next/server";
import { runStorePipeline } from "@/app/lib/listings";
import { jobStatusResponse, runMaybeAsync } from "@/app/lib/job-runner";
import { isAdminRequest } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const truthy = (v: unknown) => v === true || v === "1" || v === "true" || v === "on";

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return jobStatusResponse(req);
}

export async function POST(req: Request) {
  return runMaybeAsync(req, "auto-validate", async (r) => {
    try {
      const url = new URL(r.url);
      let seller: unknown = url.searchParams.get("seller");
      let dryRun = truthy(url.searchParams.get("dryRun"));
      if ((r.headers.get("content-type") || "").includes("application/json")) {
        const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
        if (j.seller !== undefined && j.seller !== null && j.seller !== "") seller = j.seller;
        if (j.dryRun !== undefined) dryRun = truthy(j.dryRun);
      }
      const sellerId = seller !== null && seller !== "" && Number.isFinite(Number(seller)) ? Number(seller) : null;
      const result = await runStorePipeline({ sellerId, sync: "if-stale", dryRun });
      return NextResponse.json({ ok: true, dryRun, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("auto-validate error:", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  });
}
