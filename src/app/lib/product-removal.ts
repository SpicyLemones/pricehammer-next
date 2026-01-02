import type { RunResult } from "sqlite3";
import { query, tx } from "@/lib/sql";
import { fetchProductMetadata } from "@/app/lib/product-metadata";

export type ProductRemovalLogEntry = {
  id: number;
  productId: number;
  productName: string;
  adminUser: string | null;
  deletedAt: string;
};

export type ProductRemovalResult = {
  productId: number;
  productName: string;
  logEntry: ProductRemovalLogEntry;
};

type ProductRow = { id: number; name: string; search_term: string };

export async function deleteProductCompletely(
  productId: number,
  adminUser?: string | null,
): Promise<ProductRemovalResult | null> {
  if (!Number.isFinite(productId)) {
    return null;
  }

  const product = (await query<ProductRow | undefined>("get", "select/product_id", [productId])) ?? null;
  if (!product) {
    return null;
  }

  const metadata = await fetchProductMetadata(productId).catch(() => null);
  const productName = metadata?.displayName?.trim() || product.name;

  await query("run", "create/product_deletion_log");

  const logRow = await tx(async () => {
    await query("run", "delete/prices_by_product", [productId]);
    await query("run", "delete/product_metadata_by_product", [productId]);
    await query("run", "delete/product_by_id", [productId]);

    const logInsert = (await query("run", "insert/product_deletion_log", [
      productId,
      productName,
      adminUser ?? null,
    ])) as RunResult;

    const logId = Number(logInsert.lastID ?? 0);
    if (!Number.isFinite(logId) || logId <= 0) {
      throw new Error("log-insert-failed");
    }

    const row =
      (await query<
        { id: number; product_id: number; product_name: string; admin_user: string | null; deleted_at: string }
      >(
        "get",
        "SELECT id, product_id, product_name, admin_user, deleted_at FROM product_deletion_log WHERE id = ?",
        [logId],
      )) ?? null;

    if (!row) {
      throw new Error("log-retrieval-failed");
    }

    return row;
  });

  return {
    productId,
    productName,
    logEntry: {
      id: logRow.id,
      productId: logRow.product_id,
      productName: logRow.product_name,
      adminUser: logRow.admin_user,
      deletedAt: logRow.deleted_at,
    },
  };
}
