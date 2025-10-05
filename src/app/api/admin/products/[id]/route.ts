import { NextRequest, NextResponse } from "next/server";
import { deleteProductCompletely } from "@/app/lib/product-removal";
import { extractAdminIdentity, isAuthorizedAdmin } from "@/app/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: Params) {
  const authHeader = req.headers.get("authorization");
  if (!isAuthorizedAdmin(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  try {
    const adminIdentity = extractAdminIdentity(authHeader);
    const result = await deleteProductCompletely(productId, adminIdentity.user);
    if (!result) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const redirectTarget = `/admin?deleted=${encodeURIComponent(result.productId)}`;

    return NextResponse.json({
      ok: true,
      removed: {
        productId: result.productId,
        productName: result.productName,
      },
      log: result.logEntry,
      redirect: redirectTarget,
    });
  } catch (error) {
    console.error(`[admin:products] Failed to delete product ${productId}`, error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
