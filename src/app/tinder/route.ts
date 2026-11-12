// src/app/tinder/route.ts
import { NextResponse } from "next/server";
import { query, recomputeRemaining } from "@/lib/sql";
import { searchStore, type StoreCandidate } from "@/app/lib/store-search";
import { hasProductApi, localCandidates } from "@/app/lib/listings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


type Seller = any;
type Product = any;

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function reasonBox(opts: { reason?: string | null; flagged: boolean; link?: string | null; price?: number | null }): string {
  if (!opts.reason && !opts.link) return "";
  const color = opts.flagged ? "#f3c1bb;background:#fdeceb" : "#e0d6b8;background:#fdf8e8";
  const current = opts.link
    ? `<div style="margin-top:4px;">Currently linked: <a href="${esc(opts.link)}" target="_blank" rel="noopener">${esc(opts.link)}</a>${opts.price != null ? ` — $${esc(opts.price)}` : ""}</div>`
    : "";
  return `
    <div style="border:1px solid ${color}; border-radius:10px; padding:10px 14px; margin-bottom:14px;">
      <b>${opts.flagged ? "Flagged" : "Why is this here?"}</b> ${esc(opts.reason ?? "")}
      ${current}
    </div>`;
}

function htmlPage(opts: {
  seller: Seller;
  product: Product;
  items: TinderItem[];
  showAltBox: boolean;
  altTerm?: string;
  remaining: number;
  note?: string;
  pair?: { review_reason?: string | null; decided_by?: string | null; link?: string | null; price?: number | null };
  manual: boolean;
  manualCount: number;
}) {
  const { seller, product, items, showAltBox, altTerm = "", remaining, note, pair, manual, manualCount } = opts;
  const m = manual ? "1" : "0";

  return `
  <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
    <div style="font-size: 48px; margin-bottom: 4px;">Is this ${product.name}?</div>
    <div style="margin-bottom: 12px; color:#555;">
      <div><b>Store:</b> ${seller?.name ?? "(unknown)"} ${seller?.base_url ? `— <a href="${seller.base_url}" target="_blank" rel="noopener">open store</a>` : ""}</div>
      <div><b>Search term:</b> ${product?.search_term ?? ""}</div>
    </div>
    <div style="font-size: 20px; margin-bottom: 16px; text-align:center;">
      ${manual ? "Manual stores" : "Needs review"}: ${remaining}
      <span style="font-size:14px; margin-left:12px;">
        ${manual
          ? `<a href="/tinder">back to the review queue</a>`
          : `<a href="/tinder?manual=1">manual stores (${manualCount})</a>`}
      </span>
    </div>

    ${reasonBox({
      reason: pair?.review_reason,
      flagged: pair?.decided_by === "flag",
      link: pair?.decided_by === "flag" ? pair?.link : null,
      price: pair?.decided_by === "flag" ? pair?.price : null,
    })}

    <div id="loading" style="text-align:center; margin:8px 0 10px; color:#666;">${esc(note ?? "")}</div>

    <div id="candInfo" style="text-align:center; margin-bottom: 10px;">
      <div id="candTitle" style="font-size:22px; font-weight:600;"></div>
      <div style="margin:4px 0;">
        <span id="candPrice" style="font-size:20px;"></span>
        <span id="candScore" style="margin-left:10px; padding:2px 8px; border-radius:999px; font-size:14px;"></span>
        <span id="candPos" style="margin-left:10px; color:#888; font-size:14px;"></span>
      </div>
      <a id="productLink" href="#" target="_blank" rel="noopener" style="font-size: 14px; color: #3498db; text-decoration: underline; word-break:break-all;">#</a>
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; gap:20px; margin-bottom:20px;">
      <button class="yuckBtn" onclick="yuck()">❌ Yuck</button>
      <img id="productImage" />
      <button class="yumBtn" onclick="yum()">✅ Yum</button>
    </div>

    <div style="display:flex; justify-content:center; gap:12px; margin-bottom:20px;">
      <a class="backBtn" href="/tinder/undo?m=${m}">⬅ Undo Last</a>
    </div>

    <!-- Alt-search + manual validate -->
    <div id="altBox" style="display:${showAltBox ? "block" : "none"};margin-top:16px;">
      <div style="border:1px solid #ddd; border-radius:10px; padding:12px;">
        <h3 style="margin:0 0 6px 0;">No matches? Try an alternate search</h3>
        <form id="altSearchForm" method="POST" action="/tinder" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <input type="hidden" name="s" value="${seller.id}" />
          <input type="hidden" name="p" value="${product.id}" />
          <input type="hidden" name="m" value="${m}" />
          <input id="altTerm" name="altTerm" placeholder="Alternate keywords / SKU / different spelling..."
                 value="${esc(altTerm)}"
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
          <a id="forceInvalidate" href="/tinder/invalidate?s=${seller.id}&p=${product.id}&m=${m}"
             style="padding:8px 12px; border-radius:8px; background:#e74c3c; color:#fff; text-decoration:none;">
            Force Invalidate
          </a>
        </div>

        <!-- NEW: Manual validate -->
        <div style="margin-top:14px;">
          <h4 style="margin:0 0 6px 0;">Or validate manually</h4>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <input id="manualLink" placeholder="Paste product URL" style="flex:2; min-width:320px; padding:8px; border:1px solid #ccd; border-radius:8px;" />
            <input id="manualPrice" placeholder="Price (e.g. 94.80)" inputmode="decimal" style="flex:1; min-width:140px; padding:8px; border:1px solid #ccd; border-radius:8px;" />
            <button type="button" id="manualValidateBtn"
              style="padding:8px 12px; border-radius:8px; background:#2ecc71; color:#fff; border:none;"
              onclick="validateManual()">
              Validate
            </button>
          </div>
          <div style="font-size:12px;color:#666;margin-top:6px;">
            We’ll save exactly what you enter. Currency symbols and commas are okay (e.g. “$94.80”, “94,80”).
          </div>
        </div>

        <div style="font-size:12px;color:#666;margin-top:10px;">
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

      function cleanPrice(p) {
        const s = String(p || "").replace(/,/g, "");
        const m = s.match(/-?\\d+(?:\\.\\d+)?/);
        return m ? m[0] : "";
      }

      function render() {
        const cand  = products[idx];
        const imgEl = $q("#productImage");
        const a     = $q("#productLink");
        const loading = $q("#loading");

        if (!cand) {
          if (loading) loading.textContent = products.length
            ? "That was every candidate. Try the alternate search below."
            : (loading.textContent || "No results. Try the alternate search below.");
          showAlt();
          setControls(false);
          if (a) { a.href = "#"; a.textContent = "#"; }
          if (imgEl) imgEl.removeAttribute("src");
          return;
        }

        if (loading) loading.style.display = "none";
        showAlt();
        setControls(true);

        setImage(imgEl, cand.img);
        if (a) { a.href = cand.link || "#"; a.textContent = cand.link || "#"; }
        const t = $q("#candTitle"); if (t) t.textContent = cand.title || "(untitled)";
        const pr = $q("#candPrice"); if (pr) pr.textContent = cand.price != null && cand.price !== "" ? "$" + Number(cand.price).toFixed(2) : "no price";
        const sc = $q("#candScore");
        if (sc) {
          const pct = Math.round((cand.score || 0) * 100);
          sc.textContent = cand.reason === "sku" ? "SKU match" : (String(cand.title || "").startsWith("Current link:") ? "currently on the site" : pct + "% name match");
          sc.style.background = cand.reason === "sku" || pct >= 85 ? "#d4f5dc" : pct >= 60 ? "#fdf3cf" : "#fbe0dd";
        }
        const pos = $q("#candPos"); if (pos) pos.textContent = (idx + 1) + " of " + products.length;

        // Prefill manual inputs only if empty (so we don't overwrite what the user typed)
        const ml = $q("#manualLink");
        const mp = $q("#manualPrice");
        if (ml && !ml.value) ml.value = cand.link || "";
        if (mp && !mp.value && (cand.price !== undefined && cand.price !== null)) mp.value = String(cand.price);
      }

      function yuck() { idx++; render(); }

      function yum() {
        const cand = products[idx] || { link:"", price:"" };
        const update = $q("#updateTerm")?.checked ? "1" : "";
        const altTermVal = $q("#altTerm")?.value || "";
        const href = "/tinder/validate?s=${seller.id}&p=${product.id}&m=${m}" +
                     "&link=" + encodeURIComponent(cand.link || "") +
                     "&price=" + encodeURIComponent(String(cand.price || "")) +
                     (update ? ("&updateTerm=1&altTerm=" + encodeURIComponent(altTermVal)) : "");
        window.location.href = href;
      }

      // NEW: manual validate with entered link & price
      function validateManual() {
        const link = ($q("#manualLink")?.value || "").trim();
        const priceRaw = ($q("#manualPrice")?.value || "").trim();
        const price = cleanPrice(priceRaw);
        if (!link || !price) {
          alert("Please enter both a product link and a price.");
          return;
        }
        const update = $q("#updateTerm")?.checked ? "1" : "";
        const altTermVal = $q("#altTerm")?.value || "";
        const href = "/tinder/validate?s=${seller.id}&p=${product.id}&m=${m}" +
                     "&link=" + encodeURIComponent(link) +
                     "&price=" + encodeURIComponent(price) +
                     (update ? ("&updateTerm=1&altTerm=" + encodeURIComponent(altTermVal)) : "");
        window.location.href = href;
      }

      // Enter key on manual inputs triggers validate
      ["#manualLink", "#manualPrice"].forEach(sel => {
        const el = $q(sel);
        el && el.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter") { ev.preventDefault(); validateManual(); }
        });
      });

      window.yuck = yuck;
      window.yum  = yum;
      window.validateManual = validateManual;

      // ← / → to swipe without the mouse (ignored while typing in a field)
      document.addEventListener("keydown", (ev) => {
        const tag = (ev.target && ev.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        if (ev.key === "ArrowLeft") { ev.preventDefault(); yuck(); }
        if (ev.key === "ArrowRight" && products[idx]) { ev.preventDefault(); yum(); }
      });

      render();
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

type TinderItem = {
  title: string;
  link: string;
  price: number | string;
  img: string;
  score: number;
  reason: StoreCandidate["reason"];
};

async function productSkus(productId: number): Promise<string[]> {
  const row = (await query(
    "get",
    `SELECT canonical_sku, sku_aliases FROM product_skus WHERE product_id = ?`,
    [productId],
  )) as { canonical_sku: string | null; sku_aliases: string | null } | undefined;
  if (!row) return [];
  const out: string[] = [];
  if (row.canonical_sku) out.push(row.canonical_sku);
  try {
    for (const a of JSON.parse(row.sku_aliases ?? "[]")) if (typeof a === "string") out.push(a);
  } catch {}
  return out;
}

// Saved listings first (instant, already scored); the store's live search
// fills in when we have fewer than 3, and is the only source for alternate
// search terms.
async function candidatesFor(seller: Seller, product: Product, term?: string) {
  const local = term ? [] : await localCandidates(Number(seller?.id), Number(product?.id));
  let note: string | undefined;
  let live: StoreCandidate[] = [];
  if (local.length < 3 && hasProductApi(seller)) {
    const skus = await productSkus(Number(product?.id));
    const result = await searchStore(seller, product, { term, productSkus: skus });
    live = result.candidates;
    if (!local.length) note = result.note;
  } else if (!local.length) {
    note = "this store has no public product API — open the store, find the item, and paste its link and price below";
  }
  const seen = new Set<string>();
  const merged = [...local, ...live].filter((c) => (seen.has(c.link) ? false : (seen.add(c.link), true)));
  const items: TinderItem[] = merged.map((c) => ({
    title: c.title,
    link: c.link,
    price: c.price ?? "",
    img: c.img ?? "",
    score: c.score,
    reason: c.reason,
  }));
  return { items, note };
}

async function counts() {
  const [remaining, manual] = await Promise.all([
    recomputeRemaining(),
    query("get", "select/count_manual") as Promise<{ c: number } | undefined>,
  ]);
  return { remaining, manualCount: Number(manual?.c ?? 0) };
}

// For a flagged pair, the question is "is the current link still right?",
// so its current listing is the first card: Yum keeps it, Yuck moves on to
// the alternatives.
async function withCurrentLink(items: TinderItem[], pair: { seller_id: number; link?: string | null; price?: number | null; decided_by?: string | null }) {
  if (pair.decided_by !== "flag" || !pair.link) return items;
  const listing = (await query(
    "get",
    `SELECT title, price, image FROM store_listings WHERE seller_id = ? AND url = ?`,
    [pair.seller_id, pair.link],
  ).catch(() => undefined)) as { title: string; price: number | null; image: string | null } | undefined;
  const current: TinderItem = {
    title: `Current link: ${listing?.title ?? pair.link}`,
    link: pair.link,
    price: listing?.price ?? pair.price ?? "",
    img: listing?.image ?? "",
    score: 0,
    reason: "name",
  };
  return [current, ...items.filter((i) => i.link !== pair.link)];
}

export async function GET(req: Request) {
  const manual = new URL(req.url).searchParams.get("manual") === "1";
  const price = await query("get", manual ? "select/unchecked_manual" : "select/unchecked_prices");
  const { remaining, manualCount } = await counts();
  if (!price) {
    const html = `
      <div style="max-width:900px;margin:24px auto;font-family:system-ui,Segoe UI,Arial">
        <h2>${manual ? "No manual-store items left." : "Nothing needs review. Automation has it covered."}</h2>
        <p>${manual ? `<a href="/tinder">Back to the review queue</a>` : manualCount ? `<a href="/tinder?manual=1">${manualCount} items at manual stores</a> (optional)` : ""}</p>
        <a href="/admin"><button>Admin Panel</button></a>
      </div>`;
    return new NextResponse(html, { headers: noStoreHeaders() });
  }

  const [seller, product] = await Promise.all([
    query("get", "select/seller_id", [price.seller_id]),
    query("get", "select/product_id", [price.product_id]),
  ]);
  const found = await candidatesFor(seller, product);
  const items = await withCurrentLink(found.items, price);
  const note = items.length ? undefined : found.note;

  console.log("[/tinder] candidates", items.length, "store:", seller?.name, "reason:", price.review_reason);

  const html = htmlPage({
    seller, product, items, showAltBox: true, remaining: manual ? manualCount : remaining,
    note, pair: price, manual, manualCount,
  });
  return new NextResponse(html, { headers: noStoreHeaders() });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const s = Number(form.get("s"));
  const p = Number(form.get("p"));
  const useName = form.get("useName");
  const altTermRaw = (form.get("altTerm") || "").toString().trim();
  const manual = form.get("m") === "1";

  const [seller, product, pair, { remaining, manualCount }] = await Promise.all([
    query("get", "select/seller_id", [s]),
    query("get", "select/product_id", [p]),
    query("get", `SELECT * FROM prices WHERE seller_id = ? AND product_id = ?`, [s, p]),
    counts(),
  ]);
  if (!seller || !product) {
    return NextResponse.redirect(new URL(manual ? "/tinder?manual=1" : "/tinder", req.url), 303);
  }

  const altTerm = useName ? product.name : altTermRaw;
  const { items, note } = await candidatesFor(seller, product, altTerm || undefined);

  console.log("[/tinder POST] candidates", items.length, "term:", altTerm || product.search_term);

  const html = htmlPage({
    seller, product, items, showAltBox: true, altTerm, remaining: manual ? manualCount : remaining,
    note, pair, manual, manualCount,
  });
  return new NextResponse(html, { headers: noStoreHeaders() });
}
