import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { searchSeller } from "@/lib/scraper";
import { getLastAction } from "./_state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function originOf(req: Request) {
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const proto = req.headers.get("x-forwarded-proto") || u.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // allow focusing a specific pair (optional)
  const focusS = url.searchParams.get("s");
  const focusP = url.searchParams.get("p");

  let sellerId: number;
  let productId: number;

  if (focusS && focusP) {
    sellerId = Number(focusS);
    productId = Number(focusP);
  } else {
    const unchecked = await query("get", "select/unchecked_prices");
    if (!unchecked) {
      const html = `
        <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
          <h2>No unchecked prices left!</h2>
          <a href="/admin"><button>Admin Panel</button></a>
        </div>`;
      return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    }
    sellerId = unchecked.seller_id;
    productId = unchecked.product_id;
  }

  const seller  = await query("get", "select/seller_id", [sellerId]);
  const product = await query("get", "select/product_id", [productId]);

  const cands = await searchSeller(seller, product);
  const usable = (cands || []).filter((c) => !!c.link);

  if (!usable.length) {
    await query("run", "update/invalidate_price", [seller.id, product.id]);
    return NextResponse.redirect(new URL("/tinder", originOf(req)));
  }

  const items = usable.map((c) => ({
    link: c.link || "",
    price: c.price ?? "",
    img: c.img ? c.img.toString("base64") : "",
  }));

  // ←—— here’s the previous action you just recorded on validate/invalidate:
  const prev = getLastAction();
  const undoHref = prev
    ? `/tinder/undo?s=${prev.s}&p=${prev.p}`
    : `/tinder/undo`; // fallback does nothing meaningful

  const html = `
    <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
      <div style="font-size: 48px; margin-bottom: 12px;">Is this ${product.name}?</div>

      <div style="text-align: center; margin-bottom: 10px;">
        <a id="productLink" href="#" target="_blank" style="font-size: 20px; color: #3498db; text-decoration: underline;">#</a>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:20px;">
        <button class="yuckBtn" onclick="yuck()">❌ Yuck</button>
        <img id="productImage" />
        <button class="yumBtn" onclick="yum()">✅ Yum</button>
      </div>

      <div style="display:flex; justify-content:center; gap:12px; margin-bottom:20px;">
        <a class="backBtn" href="${undoHref}">⬅ Undo Last</a>
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
        let idx = 0;

        function render() {
          const cand = products[idx];
          if (!cand) {
            window.location.href = "/tinder/invalidate?s=${seller.id}&p=${product.id}";
            return;
          }
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
          const href = "/tinder/validate?s=${seller.id}&p=${product.id}"
                     + "&link=" + encodeURIComponent(cand.link||"")
                     + "&price=" + encodeURIComponent(String(cand.price||""));
          window.location.href = href;
        }
        render();
      </script>
    </div>`;

  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
