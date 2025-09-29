import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { query } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Seller = {
  name: string;
  base_url: string;
  search_url: string;
  product_selector: string;
  name_selector?: string;
  link_selector?: string;
  price_selector?: string;
  sale_selector?: string;
  image_selector?: string;
};

type Product = { name: string; search_term: string };

export async function POST() {
  try {
    // 1) Ensure tables exist
    await query("run", "create/products");
    await query("run", "create/prices");
    await query("run", "create/sellers");
    try { await query("run", "create/bug_reports"); } catch {}

    // 2) Load JSON seed files
    const root = path.join(process.cwd(), "data", "db", "json");
    const sellers: Seller[] = JSON.parse(fs.readFileSync(path.join(root, "sellers.json"), "utf8"));
    const products: Product[] = JSON.parse(fs.readFileSync(path.join(root, "products.json"), "utf8"));

    // 3) Upsert sellers (skip duplicates by name+base_url)
    const existingSellers = await query<any[]>("all", "select/all_sellers");
    const seenSellers = new Set(existingSellers.map(s => `${s.name}|||${s.base_url}`));
    for (const s of sellers) {
      const key = `${s.name}|||${s.base_url}`;
      if (seenSellers.has(key)) continue;
      await query("run", "insert/seller", [
        s.name, s.base_url, s.search_url, s.product_selector,
        s.name_selector ?? null, s.link_selector ?? null, s.price_selector ?? null,
        s.sale_selector ?? null, s.image_selector ?? null
      ]);
    }

    // 4) Upsert products (skip duplicates by name+search_term)
    const existingProducts = await query<any[]>("all", "select/all_products");
    const seenProducts = new Set(existingProducts.map(p => `${p.name}|||${p.search_term}`));
    for (const p of products) {
      const key = `${p.name}|||${p.search_term}`;
      if (seenProducts.has(key)) continue;
      await query("run", "insert/product", [p.name, p.search_term]);
    }

    // 5) Seed prices matrix for any missing (seller, product) pairs
    const freshSellers = await query<any[]>("all", "select/all_sellers");
    const freshProducts = await query<any[]>("all", "select/all_products");
    // If you already have helper queries insert/seed_* you can use those; else do pairwise insert here:
    for (const s of freshSellers) {
      for (const p of freshProducts) {
        // insert/price should be an "IF NOT EXISTS" style insert; if not, wrap in try/catch
        try {
          await query("run", "insert/price", [s.id, p.id]);
        } catch {}
      }
    }

    // 6) Report how many unchecked we’ve got
    const unchecked = await query<any[]>("all", "select/count_unsorted");
    return NextResponse.json({
      ok: true,
      sellers: freshSellers.length,
      products: freshProducts.length,
      uncheckedCount: unchecked.length
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "setup failed" }, { status: 500 });
  }
}
