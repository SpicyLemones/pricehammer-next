// src/app/tinder/route.ts
import { NextResponse } from "next/server";
import { query } from "@/lib/sql";
import { searchSeller } from "@/lib/scraper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function remainingCount(): Promise<number> {
  const rows = await query("all", "select/count_unsorted");
  return rows.length;
}

type Seller = any;
type Product = any;

function htmlPage(opts: {
  seller: Seller;
  product: Product;
  items: { link: string; price: number | string; img: string }[];
  showAltBox: boolean;
  altTerm?: string;
  remaining: number;
}) {
  const { seller, product, items, showAltBox, altTerm = "", remaining } = opts;

  return `
  <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
    <div style="font-size: 48px; margin-bottom: 4px;">Is this ${product.name}?</div>
    <div style="margin-bottom: 12px; color:#555;">
      <div><b>Store:</b> ${seller?.name ?? "(unknown)"} ${seller?.base_url ? `— <a href="${seller.base_url}" target="_blank" rel="noopener">open store</a>` : ""}</div>
      <div><b>Search term:</b> ${product?.search_term ?? ""}</div>
    </div>
    <div style="font-size: 20px; margin-bottom: 16px; text-align:center;">
      Remaining unchecked prices: ${remaining}
    </div>

    <div id="loading" style="text-align:center; margin:8px 0 10px; color:#666;">Loading candidates…</div>

    <div style="text-align: center; margin-bottom: 10px;">
      <a id="productLink" href="#" target="_blank" style="font-size: 20px; color: #3498db; text-decoration: underline;">#</a>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:20px;">
      <button class="yuckBtn" onclick="yuck()">❌ Yuck</button>
      <img id="productImage" />
      <button class="yumBtn" onclick="yum()">✅ Yum</button>
    </div>

    <div style="display:flex; justify-content:center; gap:12px; margin-bottom:20px;">
      <a class="backBtn" href="/tinder/undo">⬅ Undo Last</a>
    </div>

    <div id="altBox" style="display:block;margin-top:16px;">
      <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
        <h3 style="margin:0 0 6px 0;">No matches? Try an alternate search</h3>
        <form id="altSearchForm" method="POST" action="/tinder" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input type="hidden" name="s" value="${seller.id}" />
          <input type="hidden" name="p" value="${product.id}" />
          <input id="altTerm" name="altTerm" placeholder="Alternate keywords / SKU / different spelling..."
                 value="${altTerm || ""}"
                 style="flex:1; min-width:280px; padding:8px; border:1px solid #ccd; border-radius:8px;" />
          <button type="submit" style="padding:8px 12px; border-radius:8px; background:#3498db; color:#fff; border:none;">Search</button>
          <button type="submit" formaction="/tinder" formmethod="POST" name="useName" value="1"
                  style="padding:8px 12px; border-radius:8px; background:#6c757d; color:#fff; border:none;">
            Use product name
          </button>
        </form>

        <div style="margin-top:10px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
          <label style="display:flex; gap:8px; align-items:center;">
            <input type="checkbox" id="updateTerm" />
            <span>Update search term in DB if I click <b>Yum</b></span>
          </label>
          <a id="forceInvalidate" href="/tinder/invalidate?s=${seller.id}&p=${product.id}"
             style="padding:8px 12px; border-radius:8px; background:#e74c3c; color:#fff; text-decoration:none;">
            Force Invalidate
          </a>
        </div>
        <div style="font-size:12px;color:#666;margin-top:6px;">
          Tip: “Search” uses your custom text; “Use product name” runs with the product’s DB name.
        </div>
      </div>
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

      function $q(sel){ return document.querySelector(sel); }

      function setImage(imgEl, value) {
        if (!imgEl) return;
        const v = value || "";
        if (!v) { imgEl.removeAttribute("src"); return; }
        // If it's already a URL or a data URL, use it as-is; otherwise treat as raw base64
        if (/^https?:\\/\\//i.test(v) || v.startsWith("data:")) imgEl.src = v;
        else imgEl.src = "data:image/jpeg;base64," + v;
      }

      function setControls(enabled) {
        const yumBtn  = $q(".yumBtn");
        const yuckBtn = $q(".yuckBtn");
        if (yumBtn)  yumBtn.disabled  = !enabled;
        if (yuckBtn) yuckBtn.disabled = !enabled;
      }

      function showAlt() {
        const altBox = $q("#altBox");
        if (altBox) altBox.style.display = "block";
      }

      function render() {
        const cand  = products[idx];
        const imgEl = $q("#productImage");
        const a     = $q("#productLink");
        const loading = $q("#loading");

        if (!cand) {
          if (loading) loading.textContent = "No results loaded. Try the alternate search below.";
          showAlt();
          setControls(false);
          if (a) { a.href = "#"; a.textContent = "#"; }
          if (imgEl) imgEl.removeAttribute("src");
          return;
        }

        if (loading) loading.style.display = "none";
        showAlt();
        setControls(true);

        // ✅ accept URL/data/base64
        setImage(imgEl, cand.img);

        a.href = cand.link || "#";
        a.textContent = cand.link || "#";

        console.log("Raw image value:", cand.img);
        console.log("Product image src:", imgEl.src || "(none)");
        console.log("Product link href:", a.href || "(none)");
      }

      function yuck() { idx++; render(); }
      function yum() {
        const cand = products[idx] || { link:"", price:"" };
        const update = $q("#updateTerm")?.checked ? "1" : "";
        const altTermVal = $q("#altTerm")?.value || "";
        const href = "/tinder/validate?s=${seller.id}&p=${product.id}" +
                     "&link=" + encodeURIComponent(cand.link || "") +
                     "&price=" + encodeURIComponent(String(cand.price || "")) +
                     (update ? ("&updateTerm=1&altTerm=" + encodeURIComponent(altTermVal)) : "");
        window.location.href = href;
      }

      // expose to inline onclick
      window.yuck = yuck;
      window.yum  = yum;

      render();

      // Failsafe: if array empty after 1.5s, show alt box
      setTimeout(() => {
        if (!products || products.length === 0) {
          const loading = $q("#loading");
          if (loading) loading.textContent = "No results loaded. Try the alternate search below.";
          showAlt(); setControls(false);
        }
      }, 1500);
    </script>
  </div>
  `;
}

function noStoreHeaders() {
  return {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store, no-cache, must-revalidate, max-age=0",
    pragma: "no-cache",
  };
}

export async function GET(req: Request) {
  const price = await query("get", "select/unchecked_prices");
  if (!price) {
    const html = `
      <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
        <h2>No unchecked prices left!</h2>
        <a href="/admin"><button>Admin Panel</button></a>
      </div>`;
    return new NextResponse(html, { headers: noStoreHeaders() });
  }

  const seller  = await query("get", "select/seller_id",  [price.seller_id]);
  const product = await query("get", "select/product_id", [price.product_id]);

  const results = await searchSeller(seller, product);
  const usable = (results || [])
    .filter((c: any) => !!c.link)
    .map((c: any) => ({
      link: c.link,
      price: c.price ?? "",
      // ✅ Only encode when it's a Buffer; otherwise pass the URL/data string through.
      img: (typeof Buffer !== "undefined" && Buffer.isBuffer(c.img)) ? c.img.toString("base64") : (c.img || "")
    }));

  console.log("[/tinder] usable", usable.length, "store:", seller?.name, "term:", product?.search_term);

  const html = htmlPage({
    seller,
    product,
    items: usable,
    showAltBox: true,
    remaining: await remainingCount(),
  });

  return new NextResponse(html, { headers: noStoreHeaders() });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const s = Number(form.get("s"));
  const p = Number(form.get("p"));
  const useName = form.get("useName");
  const altTermRaw = (form.get("altTerm") || "").toString().trim();

  const seller  = await query("get", "select/seller_id", [s]);
  const product = await query("get", "select/product_id", [p]);

  const altTerm = useName ? product.name : altTermRaw;
  const productForSearch = { ...product, search_term: altTerm || product.search_term };

  const results = await searchSeller(seller, productForSearch);
  const usable = (results || [])
    .filter((c: any) => !!c.link)
    .map((c: any) => ({
      link: c.link,
      price: c.price ?? "",
      img: (typeof Buffer !== "undefined" && Buffer.isBuffer(c.img)) ? c.img.toString("base64") : (c.img || "")
    }));

  console.log("[/tinder POST] usable", usable.length, "term:", productForSearch.search_term);

  const html = htmlPage({
    seller,
    product,
    items: usable,
    showAltBox: true,
    altTerm,
    remaining: await remainingCount(),
  });

  return new NextResponse(html, { headers: noStoreHeaders() });
}
