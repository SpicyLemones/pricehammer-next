import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedAdmin } from "@/app/lib/auth";
import {
  fetchProductMetadata,
  upsertProductMetadata,
  ProductMetadataInput,
} from "@/app/lib/product-metadata";

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
  image?: string | null;
};

type MutableMetadata = {
  name: string;
  game: string | null;
  faction: string | null;
  category: string | null;
  points: number | null;
  hidden: boolean;
  image: string | null;
};

function applyNameField(target: MutableMetadata, body: Body) {
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

function applyStringField(target: MutableMetadata, body: Body, key: "game" | "faction" | "category") {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return;
  const raw = body[key];

  if (raw === null || raw === undefined) {
    target[key] = null;
    return;
  }

  if (typeof raw !== "string") {
    throw new Error(`invalid-${key}`);
  }

  const trimmed = raw.trim();
  target[key] = trimmed ? trimmed : null;
}

function applyPointsField(target: MutableMetadata, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "points")) return;
  const raw = body.points;

  if (raw === null || raw === undefined || raw === "") {
    target.points = null;
    return;
  }

  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("invalid-points");
  }

  target.points = value;
}

function applyHiddenField(target: MutableMetadata, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "hidden")) return;
  const raw = body.hidden;

  if (raw === null || raw === undefined) {
    target.hidden = false;
    return;
  }

  if (typeof raw !== "boolean") {
    throw new Error("invalid-hidden");
  }

  target.hidden = raw;
}

function applyImageField(target: MutableMetadata, body: Body) {
  if (!Object.prototype.hasOwnProperty.call(body, "image")) return;
  const raw = body.image;

  if (raw === null || raw === undefined) {
    target.image = null;
    return;
  }

  if (typeof raw !== "string") {
    throw new Error("invalid-image");
  }

  const trimmed = raw.trim();
  target.image = trimmed ? trimmed : null;
}

function buildUpdatedMetadata(existing: MutableMetadata, body: Body): MutableMetadata {
  const updated: MutableMetadata = { ...existing };

  applyNameField(updated, body);
  applyStringField(updated, body, "game");
  applyStringField(updated, body, "faction");
  applyStringField(updated, body, "category");
  applyPointsField(updated, body);
  applyHiddenField(updated, body);
  applyImageField(updated, body);

  return updated;
}

export async function PUT(req: NextRequest, { params }: Params) {
  const authHeader = req.headers.get("authorization");
  if (!isAuthorizedAdmin(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const existing = await fetchProductMetadata(productId);
  if (!existing) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const base: MutableMetadata = {
    name: existing.metadataName ?? existing.baseName,
    game: existing.game,
    faction: existing.faction,
    category: existing.category,
    points: existing.points,
    hidden: existing.hidden,
    image: existing.image,
  };

  let updated: MutableMetadata;
  try {
    updated = buildUpdatedMetadata(base, body);
  } catch (error: unknown) {
    const code = error instanceof Error && typeof error.message === "string" ? error.message : "invalid-input";
    const message =
      code === "invalid-points"
        ? "Points must be a non-negative number"
        : code === "invalid-name"
        ? "Name must be provided"
        : code === "invalid-hidden"
        ? "Hidden must be true or false"
        : code === "invalid-game" || code === "invalid-faction" || code === "invalid-category"
        ? "Text fields must be strings"
        : code === "invalid-image"
        ? "Image must be a string"
        : "Invalid input received";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const input: ProductMetadataInput = {
    name: updated.name,
    game: updated.game,
    faction: updated.faction,
    category: updated.category,
    points: updated.points,
    hidden: updated.hidden,
    image: updated.image,
  };

  try {
    const saved = await upsertProductMetadata(productId, input);
    return NextResponse.json({
      ok: true,
      product: {
        id: String(saved.productId),
        name: saved.metadataName ?? saved.displayName,
        game: saved.game,
        faction: saved.faction,
        category: saved.category,
        points: saved.points,
        hidden: saved.hidden,
        image: saved.image,
      },
    });
  } catch (error: unknown) {
    const code = error instanceof Error && typeof error.message === "string" ? error.message : "unknown";
    if (code === "name-required" || code === "invalid-product-id") {
      return NextResponse.json({ error: "Invalid product metadata" }, { status: 400 });
    }
    console.error("[product-metadata] Failed to persist changes", error);
    return NextResponse.json({ error: "Failed to persist changes" }, { status: 500 });
  }
}
