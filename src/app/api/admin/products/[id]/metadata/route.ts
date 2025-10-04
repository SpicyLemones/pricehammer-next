import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/app/lib/auth";
import {
  ManualProductRecord,
  loadManualProductById,
  saveManualProductOverride,
} from "@/app/lib/manual-products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type Body = {
  name?: string | null;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | string | null;
  hidden?: boolean | null;
};

function applyNameField(target: ManualProductRecord, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "name")) return;
  const raw = body.name;

  if (raw === null || raw === undefined) {
    throw new Error("invalid-name");
  }

  if (typeof raw !== "string") {
    throw new Error("invalid-name");
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("invalid-name");
  }

  target.name = trimmed;
}

function applyStringField(
  target: ManualProductRecord,
  body: Body,
  key: "game" | "faction" | "category",
) {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return;
  const raw = body[key];

  if (raw === null || raw === undefined) {
    delete target[key];
    return;
  }

  if (typeof raw !== "string") {
    throw new Error(`invalid-${key}`);
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    delete target[key];
    return;
  }

  target[key] = trimmed;
}

function applyPointsField(target: ManualProductRecord, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "points")) return;
  const raw = body.points;

  if (raw === null || raw === undefined || raw === "") {
    delete target.points;
    return;
  }

  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("invalid-points");
  }

  target.points = value;
}

function applyHiddenField(target: ManualProductRecord, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "hidden")) return;
  const raw = body.hidden;

  if (raw === null || raw === undefined) {
    delete target.hidden;
    return;
  }

  if (typeof raw !== "boolean") {
    throw new Error("invalid-hidden");
  }

  target.hidden = raw;
}

function buildUpdatedProduct(existing: ManualProductRecord, body: Body) {
  const updated: ManualProductRecord = { ...existing };

  applyNameField(updated, body);
  applyStringField(updated, body, "game");
  applyStringField(updated, body, "faction");
  applyStringField(updated, body, "category");
  applyPointsField(updated, body);
  applyHiddenField(updated, body);

  return updated;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const authHeader = req.headers.get("authorization");
  if (!isAuthorizedAdmin(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await loadManualProductById(id);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let updatedProduct: ManualProductRecord;
  try {
    updatedProduct = buildUpdatedProduct(existing, body);
  } catch (error: unknown) {
    const code = error instanceof Error && typeof error.message === "string" ? error.message : "invalid-input";
    const message =
      code === "invalid-points"
        ? "Points must be a non-negative number"
        : code === "invalid-name"
        ? "Name must be provided"
        : code === "invalid-hidden"
        ? "Hidden must be true or false"
        : "Invalid input received";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const stored = await saveManualProductOverride(id, updatedProduct);
    return NextResponse.json({ ok: true, product: stored ?? updatedProduct });
  } catch (error) {
    const code = error instanceof Error && error.message ? error.message : "persist-failed";
    if (code === "invalid-name") {
      return NextResponse.json({ error: "Name must be provided" }, { status: 400 });
    }
    console.error("[product-metadata] Failed to persist override", error);
    return NextResponse.json({ error: "Failed to persist changes" }, { status: 500 });
  }
}
