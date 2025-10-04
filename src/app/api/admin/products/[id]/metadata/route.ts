import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { isAuthorizedAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type ProductRecord = Record<string, unknown>;

type Body = {
  name?: string | null;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | string | null;
};

const PRODUCTS_MARKER = "export const Products: Product[] =";

function formatProductsArray(products: ProductRecord[]) {
  const json = JSON.stringify(products, null, 2);
  return json.replace(/\n\]$/, "\n];");
}

function applyNameField(target: ProductRecord, body: Body) {
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

function applyStringField(target: ProductRecord, body: Body, key: "game" | "faction" | "category") {
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

function applyPointsField(target: ProductRecord, body: Body) {
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

function buildUpdatedProduct(existing: ProductRecord, body: Body) {
  const updated: ProductRecord = { ...existing };

  applyNameField(updated, body);
  applyStringField(updated, body, "game");
  applyStringField(updated, body, "faction");
  applyStringField(updated, body, "category");
  applyPointsField(updated, body);

  return updated;
}

async function readProductsFile() {
  const filePath = path.join(process.cwd(), "data/db/Product.ts");
  const source = await fs.readFile(filePath, "utf8");

  const markerIndex = source.indexOf(PRODUCTS_MARKER);
  if (markerIndex === -1) {
    throw new Error("Unable to locate Products array in Product.ts");
  }

  const arrayStart = source.indexOf("[", markerIndex + PRODUCTS_MARKER.length);
  const arrayEnd = source.indexOf("];", arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error("Unable to parse Products array");
  }

  const before = source.slice(0, arrayStart);
  const after = source.slice(arrayEnd + 2);
  const arrayContent = source.slice(arrayStart, arrayEnd + 1);
  const parsed = JSON.parse(arrayContent) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Manual products data is not an array");
  }
  const products = parsed as ProductRecord[];

  return { filePath, before, after, products };
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

  let data: Awaited<ReturnType<typeof readProductsFile>>;
  try {
    data = await readProductsFile();
  } catch (error) {
    console.error("[product-metadata] Failed to read Product.ts", error);
    return NextResponse.json({ error: "Unable to load products" }, { status: 500 });
  }

  const { filePath, before, after, products } = data;
  const index = products.findIndex((p) => String(p.id) === String(id));
  if (index === -1) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  let updatedProduct: ProductRecord;
  try {
    updatedProduct = buildUpdatedProduct(products[index], body);
  } catch (error: unknown) {
    const code = error instanceof Error && typeof error.message === "string" ? error.message : "invalid-input";
    const message =
      code === "invalid-points"
        ? "Points must be a non-negative number"
        : code === "invalid-name"
        ? "Name must be provided"
        : "Invalid input received";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  products[index] = updatedProduct;

  const formatted = formatProductsArray(products);
  const nextSource = `${before}${formatted}${after}`;

  try {
    await fs.writeFile(filePath, nextSource, "utf8");
  } catch (error) {
    console.error("[product-metadata] Failed to write Product.ts", error);
    return NextResponse.json({ error: "Failed to persist changes" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, product: updatedProduct });
}
