// src/app/api/admin/sync-stores/route.ts
//
// Sync every store's listings and reconcile price pairs automatically.
// Run by the scheduled GitHub workflow; /tinder only receives what this
// can't decide on its own.
//
//   POST ?async=1                 all stores, in the background
//   POST ?seller=6&async=1        one store
//   POST ?sync=never&dryRun=1     re-decide from saved listings, write nothing
//   GET  ?job=<id>                poll a background run
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { logAudit } from "@/app/lib/audit";
import { runStorePipeline } from "@/app/lib/listings";
import { jobStatusResponse, runMaybeAsync } from "@/app/lib/job-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return jobStatusResponse(req);
}

export async function POST(req: Request) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return runMaybeAsync(req, "sync-stores", async (r) => {
    const url = new URL(r.url);
    const sellerRaw = url.searchParams.get("seller");
    const syncRaw = url.searchParams.get("sync");
    const sync = syncRaw === "never" || syncRaw === "if-stale" ? syncRaw : "always";
    const dryRun = ["1", "true"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase());
    const result = await runStorePipeline({
      sellerId: sellerRaw && Number.isFinite(Number(sellerRaw)) ? Number(sellerRaw) : null,
      sync,
      dryRun,
    });
    if (!dryRun) await logAudit("admin", "sync-stores", { totals: result.totals, remaining: result.remainingForReview });
    return NextResponse.json({ ok: true, dryRun, ...result });
  });
}
