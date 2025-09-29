// src/app/api/report-wrong-by-link/route.ts
import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Accept JSON or form-encoded
  let link = "";
  let reason = "";

  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("application/json")) {
      const body = await req.json();
      link = String(body?.link || "");
      reason = String(body?.reason || "");
    } else {
      const form = await req.formData();
      link = String(form.get("link") || "");
      reason = String(form.get("reason") || "");
    }
  } catch {
    // ignore – link will be validated below
  }

  link = link.trim();
  reason = reason.trim();

  if (!link) {
    return NextResponse.json({ ok: false, error: "link required" }, { status: 400 });
  }

  try {
    // optional audit: safe if table exists; ignore if it doesn't
    try {
      await query("run", "create/bug_reports");
      await query("run", "insert/bug_report_minimal", [link, reason || null]);
    } catch {}

    // unvalidate every row that matches this link
    await query("run", "update/unvalidate_by_link", [link]);

    const remainingCount = await recomputeRemaining();

    // If it was a form submit (not JSON), send a simple HTML confirmation
    if (!ctype.includes("application/json")) {
      const html = `
        <div style="max-width:640px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
          <h3>Thanks — we put this link back in the Tinder queue:</h3>
          <p style="word-break:break-all;"><code>${link}</code></p>
          <div style="display:flex;gap:8px;">
            <a href="/tinder"><button>Go to Tinder</button></a>
            <a href="/admin"><button>Back to Admin</button></a>
          </div>
        </div>`;
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // JSON callers (your React UI) get JSON
    return NextResponse.json({ ok: true, remainingCount });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "error" }, { status: 500 });
  }
}
