// src/app/api/refresh-prices/route.ts
//
// Full store pipeline: re-sync every store's listings from its product API,
// then reconcile (refresh confirmed prices, auto-accept clear matches, mark
// not-stocked, notice removed/changed listings). Same as
// /api/admin/sync-stores — kept under this name for the admin panel and the
// local refresh script.
//
//   POST {seller?, async?}   async:true (or ?async=1) -> job id; poll GET ?job=<id>
import { NextResponse } from "next/server";
import { runStorePipeline } from "@/app/lib/listings";
import { jobStatusResponse, runMaybeAsync } from "@/app/lib/job-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return jobStatusResponse(req);
}

export async function POST(req: Request) {
  return runMaybeAsync(req, "refresh-prices", async (r) => {
    const result = await runStorePipeline({ sellerId: await readSeller(r), sync: "always" });
    return NextResponse.json({ ok: true, ...result });
  });
}

async function readSeller(req: Request): Promise<number | null> {
  const toSeller = (v: unknown) =>
    v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v);
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) return toSeller(((await req.json()) as { seller?: unknown })?.seller);
    if (ct.includes("form")) return toSeller((await req.formData()).get("seller"));
  } catch {}
  return toSeller(new URL(req.url).searchParams.get("seller"));
}
