// src/app/tinder/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { searchSeller } from "@/lib/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// (Optional) keep this if you later wire up an /api/undo with in-memory undo
let lastAction: { seller: number; product: number } | null = null;

async function remaining(): Promise<number> {
  const rows = await query("all", "select/count_unsorted");
  return rows.length;
}

export async function GET(req: Request) {
  // get one unchecked row
  const unchecked = await query<{
    seller_id: number;
    product_id: number;
  }>("get", "select/unchecked_prices");

  if (!unchecked) {
    const html = `
      <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
        <h2>No unchecked prices left!</h2>
        <a href="/admin"><button>Admin Panel</button></a>
      </div>`;
    return new NextResponse(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const seller = await query<any>("get", "select/seller_id", [unchecked.seller_id]);
  const product = await query<any>("get", "select/product_id", [unchecked.product_id]);

  // fetch candidates (server-side puppeteer)
  const cands = await searchSeller(seller, product);
  const usable = (cands || []).filter((c) => !!c.link);

  // if nothing usable: invalidate and move on (redirect back to /tinder on same origin)
  if (!usable.length) {
    await query("run", "update/invalidate_price", [seller.id, product.id]);
    return NextResponse.redirect(new URL("/tinder", req.url));
  }

  // remember last action (optional)
  lastAction = { seller: seller.id, product: product.id };

  // build client payload
  const items = usable.map((c) => ({
    link: c.link || "",
    price: c.price ?? "",
    img: c.img ? c.img.toString("base64") : "",
  }));

  // API endpoints: keep them RELATIVE
  const validateLink = `/api/validate?s=${seller.id}&p=${product.id}`;
  const invalidateLink = `/api/invalidate?s=${seller.id}&p=${product.id}`;
  const undoLink = `/api/undo`;

  const html = `
    <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
      <div style="font-size: 48px; margin-bottom: 12px;">Is this ${product.name}?</div>
      <div style="font-size: 20px; margin-bottom: 16px; text-align:center;">
        Remaining unchecked prices: ${await remaining()}
      </div>

      <div style="text-align: center; margin-bottom: 10px;">
        <a id="productLink" href="#" target="_blank" style="font-size: 20px; color: #3498db; text-decoration: underline;">#</a>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:20px;">
        <button class="yuckBtn" onclick="yuck()">❌ Yuck</button>
        <img id="productImage" />
        <button class="yumBtn" onclick="yum()">✅ Yum</button>
      </div>

      <div style="display:flex; justify-content:center; gap:12px; margin-bottom:20px;">
        <a class="backBtn" href="${undoLink}">⬅ Undo Last</a>
      </div>

      <style>
        a.backBtn, button { font-size:22px; font-weight:bold; padding:12px 24px; border-radius:10px; border:none; cursor:pointer; transition:all .2s; text-align:center; }
        .yuckBtn { background:#e74c3c; color:#fff; } .yuckBtn:hover{ background:#c0392b; }
        .yumBtn  { background:#2ecc71; color:#fff; } .yumBtn:hover { background:#27ae60; }
        .backBtn { background:#f1c40f; color:#000; display:inline-block; } .backBtn:hover{ background:#d4ac0d; }
        #productImage { display:block; width:100%; height:auto; max-width:70vw; max-height:80vh; object-fit:contain; border:2px solid #ddd; border-radius:12px; margin:0 auto; }
      </style>

      <script>
        const products = ${JSON.stringify(items).replace(/</g, "\\u003c")};
        const validateBase = ${JSON.stringify(validateLink)};
        const invalidate = ${JSON.stringify(invalidateLink)};
        let idx = 0;

        function render() {
          const cand = products[idx];
          if (!cand) { window.location.href = invalidate; return; }
          const imgEl = document.getElementById("productImage");
          if (cand.img) imgEl.src = "data:image/jpeg;base64," + cand.img;
          else imgEl.removeAttribute("src");
          const a = document.getElementById("productLink");
          a.href = cand.link || "#";
          a.textContent = cand.link || "#";
        }
        function yuck(){ idx++; render(); }
        function yum(){
          const cand = products[idx] || { link:"", price:"" };
          const href = validateBase
                       + "&link=" + encodeURIComponent(cand.link||"")
                       + "&price=" + encodeURIComponent(String(cand.price||""));
          window.location.href = href;
        }
        render();
      </script>
    </div>`;

  return new NextResponse(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
