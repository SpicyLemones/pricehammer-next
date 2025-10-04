// src/app/product/[id]/page.tsx
import { query } from "@/lib/sql";
import fs from "fs";
import path from "path";
import Script from "next/script";
import { headers } from "next/headers";
import { isAuthorizedAdmin } from "@/app/lib/auth";
import ProductEditForm from "./ProductEditForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = { id: number; name: string; search_term: string };
type PriceRow = {
  seller_id?: number;
  seller_name: string;
  price: number | null;
  link: string | null;
};

type ManualProduct = {
  id: string;
  name?: string;
  game?: string | null;
  faction?: string | null;
  category?: string | null;
  points?: number | string | null;
  description?: string | null;
  image?: string | null;
  [key: string]: unknown;
};

type ManualModule = {
  Products?: ManualProduct[];
  default?: ManualProduct[];
  gameCategories?: Record<string, unknown>;
};

// Format like "$100 AUD"
function fmtAUD(n?: number | null) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const money = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
  return `${money} AUD`;
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ sort?: "asc" | "desc" }>;
}) {
  const { id } = await params;
  const { sort = "asc" } = await searchParams;

  const product = (await query("get", "select/product_id", [id])) as ProductRow | undefined;
  if (!product) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Not found</h1>
        <p>Product {id} does not exist.</p>
      </div>
    );
  }

  const prices = (await query("all", "select/display_prices", [product.id])) as PriceRow[];

  // Hand-edited metadata
  let manual: ManualProduct | null = null;
  let manualGameCategories: Record<string, string[]> = {};
  try {
    const mod = (await import("../../../../data/db/Product")) as ManualModule;
    const products: ManualProduct[] = Array.isArray(mod?.Products)
      ? mod.Products
      : Array.isArray(mod?.default)
      ? mod.default
      : [];
    manual = products.find((p) => p.id === String(product.id)) ?? null;
    if (mod?.gameCategories && typeof mod.gameCategories === "object") {
      manualGameCategories = Object.fromEntries(
        Object.entries(mod.gameCategories).map(([gameKey, categories]) => [
          gameKey,
          Array.isArray(categories) ? categories.map((entry) => String(entry)) : [],
        ]),
      );
    }
  } catch {
    manual = null;
    manualGameCategories = {};
  }

  // Image fallback (use public/images/product/<filename> from Product.tsx)
  const PLACEHOLDER = "/logo/logo.png";
  const publicDir = path.join(process.cwd(), "public");
  let imgSrc = PLACEHOLDER;

  if (manual?.image && typeof manual.image === "string" && manual.image.trim()) {
    const relative = path.join("images", "product", manual.image.trim());
    const absolute = path.join(publicDir, relative);
    if (fs.existsSync(absolute)) {
      imgSrc = "/" + relative.replace(/\\/g, "/");
    }
  }

  const manualGame = typeof manual?.game === "string" ? manual.game.trim() : "";
  const manualFaction = typeof manual?.faction === "string" ? manual.faction.trim() : "";
  const manualCategory = typeof manual?.category === "string" ? manual.category.trim() : "";
  const rawPoints = manual?.points;
  const manualPoints =
    typeof rawPoints === "number" && Number.isFinite(rawPoints)
      ? rawPoints
      : typeof rawPoints === "string" && rawPoints.trim() && Number.isFinite(Number(rawPoints.trim()))
      ? Number(rawPoints.trim())
      : null;
  const faction = manualFaction || "—";
  const game = manualGame || "—";
  const category = manualCategory || "—";
  const points = manualPoints;
  const description =
    typeof manual?.description === "string" && manual.description.trim()
      ? manual.description.trim()
      : null;

  const headerList = await headers();
  const adminAuthHeader = headerList.get("authorization");
  const isAdmin = isAuthorizedAdmin(adminAuthHeader);
  const gameCategoriesForClient = manualGameCategories;

  // Initial sort on the server; JS will handle button toggles without reload
  const initiallySorted = (prices ?? []).slice().sort((a, b) => {
    const av = a.price ?? Infinity;
    const bv = b.price ?? Infinity;
    return sort === "desc" ? bv - av : av - bv;
  });

  return (
    <div className="relative">
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none
                   bg-gradient-to-b from-black/85 to-white/10
                   dark:from-slate-950/80 dark:to-slate-950/70
                   backdrop-blur-md-100"
      />

      <div className="max-w-4xl mx-auto p-6">
        <div className="space-y-6 rounded-xl border border-slate-200 shadow-lg
                        bg-white/95 dark:bg-slate-900/95
                        supports-[backdrop-filter]:backdrop-blur-sm p-6">

          <div className="flex gap-6 items-start">
            {/* Clickable image (opens modal) */}
            <button
              type="button"
              id="open-image"
              title="Click to enlarge"
              className="w-56 h-56 border rounded bg-white dark:bg-slate-950
                         border-slate-200 flex items-center justify-center overflow-hidden
                         hover:ring-2 hover:ring-slate-300 dark:hover:ring-slate-700
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgSrc} alt={product.name} className="object-contain w-full h-full" />
            </button>

            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">{product.name}</h1>

                {/* Share / Copy */}
                <button
                  id="share-btn"
                  className="inline-flex items-center rounded-md border border-slate-300
                             px-3 py-1.5 text-sm font-medium
                             bg-white hover:bg-slate-50
                             dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700
                             text-slate-800 dark:text-slate-100"
                  data-title={product.name}
                >
                  Share
                </button>
              </div>

              <div className="text-slate-700 dark:text-slate-200 mt-2 space-y-0.5">
                <div><span className="font-semibold">Game:</span> {game}</div>
                <div><span className="font-semibold">Faction:</span> {faction}</div>
                <div><span className="font-semibold">Category:</span> {category}</div>
                <div><span className="font-semibold">Points:</span> {points ?? "—"}</div>
              </div>

              {isAdmin && (
                <div className="mt-4">
                  <ProductEditForm
                    productId={String(product.id)}
                    initialValues={{
                      game: manualGame,
                      faction: manualFaction,
                      category: manualCategory,
                      points: manualPoints,
                    }}
                    gameCategories={gameCategoriesForClient}
                  />
                </div>
              )}

              {description && (
                <p className="mt-4 text-slate-700 dark:text-slate-200 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Retailers (initially server-sorted; JS will re-sort without reload) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Retailers</h2>

              {/* Buttons (no navigation) */}
              <div className="inline-flex rounded-md shadow-sm overflow-hidden border border-slate-300 dark:border-slate-700">
                <button
                  type="button"
                  id="sort-asc"
                  className={`px-3 py-1.5 text-sm font-medium
                              ${sort === "asc"
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  aria-pressed={sort === "asc"}
                  title="Sort by lowest price"
                >
                  Cheapest
                </button>
                <button
                  type="button"
                  id="sort-desc"
                  className={`px-3 py-1.5 text-sm font-medium border-l border-slate-300 dark:border-slate-700
                              ${sort === "desc"
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  aria-pressed={sort === "desc"}
                  title="Sort by highest price"
                >
                  Most Expensive
                </button>
              </div>
            </div>

            {initiallySorted?.length ? (
              <div
                id="retailer-rows"
                className="rounded-md overflow-hidden border border-slate-200/90
                           divide-y divide-slate-200/90
                           bg-white/95 dark:bg-slate-900/95"
              >
                {initiallySorted.map((r, i) => {
                  const priceNum = Number.isFinite(Number(r.price)) ? Number(r.price) : Number.POSITIVE_INFINITY;
                  return (
                    <div
                      key={`${r.seller_name}-${i}`}
                      className="p-3 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3
                                 odd:bg-slate-50/70 dark:odd:bg-slate-800/50
                                 even:bg-white/95 dark:even:bg-slate-900/95
                                 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      data-price={String(priceNum)}  // used by client-side sorter
                    >
                      <div className="font-medium text-slate-900 dark:text-slate-100">{r.seller_name}</div>

                      <div className="font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                        {fmtAUD(r.price)}
                      </div>

                      <div className="text-right">
                        {r.link ? (
                          <a
                            href={r.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center rounded-md border border-slate-300
                                       px-3 py-1.5 text-sm font-medium
                                       bg-white hover:bg-slate-50
                                       dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700
                                       text-slate-800 dark:text-slate-100"
                          >
                            Visit
                          </a>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-300 text-sm">No link</span>
                        )}
                      </div>

                      <div className="text-right">
                        <button
                          type="button"
                          className="inline-flex items-center rounded-md border border-red-300
                                     px-3 py-1.5 text-sm font-medium
                                     bg-white hover:bg-red-50
                                     dark:bg-slate-800 dark:border-red-700 dark:hover:bg-red-900/30
                                     text-red-700 dark:text-red-300 report-btn"
                          title="Report an incorrect price or broken link"
                          data-link={r.link ?? ""}
                          data-seller={r.seller_name}
                          data-product={product.name}
                          disabled={!r.link}
                        >
                          Report
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-600 dark:text-slate-300">No prices yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Image lightbox modal */}
      <div
        id="img-modal"
        className="fixed inset-0 z-50 hidden"
        aria-hidden="true"
        role="dialog"
        aria-modal="true"
      >
        {/* Backdrop */}
        <div id="img-backdrop" className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>

        {/* Centered large image */}
        <div className="relative z-10 h-full w-full flex items-center justify-center p-4">
          {/* Panel that should NOT trigger close when clicked inside */}
          <div id="img-panel" className="relative max-w-5xl w-[min(92vw,1100px)]">
            <button
              type="button"
              id="img-close"
              aria-label="Close"
              className="absolute -top-3 -right-3 rounded-full bg-white text-slate-900
                         dark:bg-slate-800 dark:text-slate-100 shadow border border-slate-300
                         dark:border-slate-700 w-9 h-9 flex items-center justify-center
                         hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none
                         focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={product.name}
              className="w-full h-auto max-h-[85vh] object-contain rounded-lg shadow-2xl bg-white dark:bg-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Share + Report + Dynamic Sort + Image Lightbox (no reload) */}
      <Script id={`enhancements-${id}`} strategy="afterInteractive">{`
        // SHARE
        (function(){
          const btn = document.getElementById('share-btn');
          if(!btn) return;
          btn.addEventListener('click', async () => {
            const title = btn.getAttribute('data-title') || document.title;
            const url = window.location.href;
            try {
              if (navigator.share) {
                await navigator.share({ title, url });
              } else if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
                btn.textContent = 'Link copied!';
                setTimeout(() => (btn.textContent = 'Share'), 1200);
              } else {
                window.prompt('Copy this link:', url);
              }
            } catch {}
          });
        })();

        // REPORT (your existing flow)
        async function reportWrong(link, sellerName, productName) {
          const cleanLink = (link ?? "").trim();
          if (!cleanLink) {
            alert("No link to report for this retailer.");
            return;
          }
          const reason = window.prompt("What's wrong with this link/price? (optional)") || "";
          try {
            const res = await fetch("/api/report-wrong-by-link", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ link: cleanLink, reason, context: { sellerName, productName } }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert("Thanks! We’ll recheck that link shortly.");
          } catch (e) {
            console.error(e);
            alert("Sorry — failed to submit the report.");
          }
        }
        (function attachReportHandlers(){
          document.querySelectorAll('.report-btn').forEach((b) => {
            b.addEventListener('click', () => {
              const link = b.getAttribute('data-link');
              const seller = b.getAttribute('data-seller');
              const product = b.getAttribute('data-product');
              reportWrong(link, seller, product);
            });
          });
        })();

        // DYNAMIC SORT (no navigation)
        (function(){
          const rowsContainer = document.getElementById('retailer-rows');
          if(!rowsContainer) return;

          const ascBtn = document.getElementById('sort-asc');
          const descBtn = document.getElementById('sort-desc');

          function setActive(which){
            const on = "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100";
            const off = "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200";
            ascBtn.className = ascBtn.className.replace(on, "").replace(off, "") + " " + (which==="asc"?on:off);
            descBtn.className = descBtn.className.replace(on, "").replace(off, "") + " " + (which==="desc"?on:off);
            ascBtn.setAttribute("aria-pressed", String(which==="asc"));
            descBtn.setAttribute("aria-pressed", String(which==="desc"));
          }

          function sortRows(direction){
            const items = Array.from(rowsContainer.children);
            items.sort((a, b) => {
              const av = Number(a.getAttribute('data-price') || 'Infinity');
              const bv = Number(b.getAttribute('data-price') || 'Infinity');
              return direction === 'desc' ? (bv - av) : (av - bv);
            });
            items.forEach(el => rowsContainer.appendChild(el));
            // Update URL without navigating
            const url = new URL(window.location.href);
            url.searchParams.set('sort', direction);
            window.history.replaceState({}, "", url.toString());
            setActive(direction);
          }

          ascBtn?.addEventListener('click', () => sortRows('asc'));
          descBtn?.addEventListener('click', () => sortRows('desc'));
        })();

        // IMAGE LIGHTBOX: close on backdrop, Esc, or ANY click outside #img-panel
        (function(){
          const openBtn = document.getElementById('open-image');
          const modal   = document.getElementById('img-modal');
          const closeBtn= document.getElementById('img-close');
          const backdrop= document.getElementById('img-backdrop');
          const panel   = document.getElementById('img-panel');

          if (!openBtn || !modal) return;

          function openModal(){
            modal.classList.remove('hidden');
            modal.setAttribute('aria-hidden', 'false');
            const originalOverflow = document.body.style.overflow;
            document.body.setAttribute('data-orig-overflow', originalOverflow);
            document.body.style.overflow = 'hidden';
            if (closeBtn) closeBtn.focus();
          }
          function closeModal(){
            modal.classList.add('hidden');
            modal.setAttribute('aria-hidden', 'true');
            const originalOverflow = document.body.getAttribute('data-orig-overflow') || '';
            document.body.style.overflow = originalOverflow;
          }

          openBtn.addEventListener('click', openModal);
          if (closeBtn) closeBtn.addEventListener('click', closeModal);
          if (backdrop) backdrop.addEventListener('click', closeModal);

          // Click anywhere outside the panel closes the modal
          modal.addEventListener('click', (e) => {
            if (!panel) return;
            const target = e.target; // <-- no TS cast in browser
            // If the click is not inside the panel, close
            if (!(panel === target || panel.contains(target))) {
              closeModal();
            }
          });

          // Prevent clicks inside the panel from bubbling to modal
          if (panel) panel.addEventListener('click', (e) => e.stopPropagation());

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
          });
        })();
      `}</Script>
    </div>
  );
}
