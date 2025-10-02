// src/app/product/[id]/page.tsx
import { query } from "@/lib/sql";
import fs from "fs";
import path from "path";
import Script from "next/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProductRow = { id: number; name: string; search_term: string };
type PriceRow = {
  // seller_id optional, but we only need name/link for reportWrong
  seller_id?: number;
  seller_name: string;
  price: number | null;
  link: string | null;
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

  const product = (await query("get", "select/product_id", [id])) as
    | ProductRow
    | undefined;

  if (!product) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Not found</h1>
        <p>Product {id} does not exist.</p>
      </div>
    );
  }

  const prices = (await query("all", "select/display_prices", [product.id])) as PriceRow[];

  // Load manual metadata (image, game, faction, category, points, description)
  let manual: any = null;
  try {
    const mod: any = await import("../../../../data/db/Product");
    const list: any[] = mod?.Products ?? mod?.default ?? [];
    manual = Array.isArray(list) ? list.find((p) => p.id === String(product.id)) : null;
  } catch {}

  // Server-side image fallback
  const PLACEHOLDER = "/logo/logo.png";
  const publicDir = path.join(process.cwd(), "public");
  let imgSrc = PLACEHOLDER;

  if (manual?.image && typeof manual.image === "string" && manual.image.trim()) {
    const relative = path.join("images", manual.image.trim());
    const absolute = path.join(publicDir, relative);
    if (fs.existsSync(absolute)) {
      imgSrc = "/" + relative.replace(/\\/g, "/");
    }
  }

  const faction = manual?.faction ?? "—";
  const game = manual?.game ?? "—";
  const category = manual?.category ?? "—";
  const points = typeof manual?.points === "number" ? manual.points : null;
  const description =
    typeof manual?.description === "string" && manual.description.trim()
      ? manual.description.trim()
      : null;

  // Sort server-side (nulls at bottom)
  const sorted = (prices ?? []).slice().sort((a, b) => {
    const av = a.price ?? Infinity;
    const bv = b.price ?? Infinity;
    return sort === "desc" ? bv - av : av - bv;
  });

  const basePath = `/product/${id}`;
  const ascHref = `${basePath}?sort=asc`;
  const descHref = `${basePath}?sort=desc`;

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
            <div className="w-56 h-56 border rounded bg-white dark:bg-slate-950
                            border-slate-200 flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc}
                alt={product.name}
                className="object-contain w-full h-full"
              />
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">
                  {product.name}
                </h1>

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

              {description && (
                <p className="mt-4 text-slate-700 dark:text-slate-200 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Retailers</h2>

              {/* Sort controls */}
              <div className="inline-flex rounded-md shadow-sm overflow-hidden border border-slate-300 dark:border-slate-700">
                <a
                  href={ascHref}
                  className={`px-3 py-1.5 text-sm font-medium
                              ${sort === "asc"
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  aria-current={sort === "asc" ? "page" : undefined}
                  title="Sort by lowest price"
                >
                  Cheapest
                </a>
                <a
                  href={descHref}
                  className={`px-3 py-1.5 text-sm font-medium border-l border-slate-300 dark:border-slate-700
                              ${sort === "desc"
                                ? "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                                : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  aria-current={sort === "desc" ? "page" : undefined}
                  title="Sort by highest price"
                >
                  Most Expensive
                </a>
              </div>
            </div>

            {sorted?.length ? (
              <div className="rounded-md overflow-hidden border border-slate-200/90
                              divide-y divide-slate-200/90
                              bg-white/95 dark:bg-slate-900/95">
                {sorted.map((r, i) => (
                  <div
                    key={i}
                    className="p-3 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3
                               odd:bg-slate-50/70 dark:odd:bg-slate-800/50
                               even:bg-white/95 dark:even:bg-slate-900/95
                               hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {r.seller_name}
                    </div>

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

                    {/* REPORT (calls your reportWrong) */}
                    <div className="text-right">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-md border border-red-300
                                   px-3 py-1.5 text-sm font-medium
                                   bg-white hover:bg-red-50
                                   dark:bg-slate-800 dark:border-red-700 dark:hover:bg-red-900/30
                                   text-red-700 dark:text-red-300 report-btn"
                        data-link={r.link ?? ""}
                        data-seller={r.seller_name}
                        data-product={product.name}
                        title="Report an incorrect price or broken link"
                        disabled={!r.link}
                      >
                        Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-slate-600 dark:text-slate-300">No prices yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* Share + Report logic (progressive enhancement) */}
      <Script id="page-enhancements" strategy="afterInteractive">{`
        // --- Share ---
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

        // --- Report (your existing flow) ---
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
              body: JSON.stringify({
                link: cleanLink,
                reason,
                context: { sellerName, productName },
              }),
            });
            if (!res.ok) throw new Error(await res.text());
            alert("Thanks! We’ll recheck that link shortly.");
          } catch (e) {
            console.error(e);
            alert("Sorry — failed to submit the report.");
          }
        }

        (function attachReportHandlers(){
          const buttons = document.querySelectorAll('.report-btn');
          buttons.forEach((b) => {
            b.addEventListener('click', () => {
              const link = b.getAttribute('data-link');
              const seller = b.getAttribute('data-seller');
              const product = b.getAttribute('data-product');
              reportWrong(link, seller, product);
            });
          });
        })();
      `}</Script>
    </div>
  );
}
