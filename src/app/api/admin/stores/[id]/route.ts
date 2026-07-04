// src/app/api/admin/stores/[id]/route.ts
//
// Manage a single store:
//   PATCH  — update lifecycle status (active/blocked/dead/retired) or name
//   DELETE — retire the store (soft delete: prices hidden, history kept)
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { isAuthorizedAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUS = new Set(["active", "blocked", "dead", "retired"]);

type Params = { params: Promise<{ id: string }> };

async function loadSeller(id: number) {
  return (await query("get", `SELECT id, name, status FROM sellers WHERE id = ?`, [
    id,
  ])) as { id: number; name: string; status: string } | undefined;
}

export async function PATCH(req: Request, ctx: Params) {
  if (!isAuthorizedAdmin(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  const seller = await loadSeller(id);
  if (!seller) {
    return NextResponse.json({ ok: false, error: "store not found" }, { status: 404 });
  }

  let body: {
    status?: string;
    name?: string;
    shippingInfo?: { tag?: string; deal?: string } | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const updates: string[] = [];
  const params: unknown[] = [];
  if (body.shippingInfo !== undefined) {
    if (body.shippingInfo === null) {
      updates.push("shipping_info = NULL");
    } else if (
      typeof body.shippingInfo.tag === "string" &&
      typeof body.shippingInfo.deal === "string"
    ) {
      updates.push("shipping_info = ?");
      params.push(JSON.stringify({ tag: body.shippingInfo.tag, deal: body.shippingInfo.deal }));
    } else {
      return NextResponse.json(
        { ok: false, error: "shippingInfo must be null or {tag, deal}" },
        { status: 400 },
      );
    }
  }
  if (body.status !== undefined) {
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json(
        { ok: false, error: `status must be one of ${[...VALID_STATUS].join("/")}` },
        { status: 400 },
      );
    }
    updates.push("status = ?");
    params.push(body.status);
  }
  if (body.name !== undefined && body.name.trim()) {
    updates.push("name = ?");
    params.push(body.name.trim());
  }
  if (!updates.length) {
    return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
  }

  params.push(id);
  await query("run", `UPDATE sellers SET ${updates.join(", ")} WHERE id = ?`, params);
  return NextResponse.json({ ok: true, store: await loadSeller(id) });
}

export async function DELETE(req: Request, ctx: Params) {
  if (!isAuthorizedAdmin(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ ok: false, error: "bad id" }, { status: 400 });
  }
  const seller = await loadSeller(id);
  if (!seller) {
    return NextResponse.json({ ok: false, error: "store not found" }, { status: 404 });
  }
  await query("run", `UPDATE sellers SET status = 'retired' WHERE id = ?`, [id]);
  return NextResponse.json({
    ok: true,
    retired: seller.name,
    note: "Soft delete: prices hidden from the site, data kept. PATCH status:'active' to restore.",
  });
}
