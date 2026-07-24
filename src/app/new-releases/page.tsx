import type { Metadata } from "next";
import Link from "next/link";
import { query } from "@/lib/sql";
import { GAME_LABELS, gameLabel } from "@/app/lib/game-labels";
import { deliveryEstimate, parseShipping } from "@/app/lib/shipping";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Releases",
  description: "The newest Games Workshop releases and pre-orders, grouped by game system.",
  alternates: { canonical: "/new-releases" },
};

type Row = {
  product_id: number;
  name: string;
  game: string | null;
  faction: string | null;
  image: string | null;
  is_pre_order: number;
  best_price: number | null;
  best_shipping: string | null;
};

const PLACEHOLDER = "/logo/logo.png";
const imgSrc = (image?: string | null) => {
  const val = image?.trim();
  if (!val) return PLACEHOLDER;
  if (/^https?:\/\//.test(val) || val.startsWith("/")) return val;
  return `/images/product/${val}`;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function NewReleasesPage() {
  const rows = (await query(
    "all",
    `SELECT m.product_id, m.name, m.game, m.faction, m.image, m.is_pre_order,
            (SELECT MIN(pr.price) FROM prices pr
             JOIN sellers s ON s.id = pr.seller_id
             WHERE pr.product_id = m.product_id AND pr.validated = 1 AND pr.price IS NOT NULL
               AND COALESCE(s.status,'active') NOT IN ('dead','retired')) AS best_price,
            (SELECT s.shipping_info FROM prices pr
             JOIN sellers s ON s.id = pr.seller_id
             WHERE pr.product_id = m.product_id AND pr.validated = 1 AND pr.price IS NOT NULL
               AND COALESCE(s.status,'active') NOT IN ('dead','retired')
             ORDER BY pr.price ASC LIMIT 1) AS best_shipping
     FROM product_metadata m
     WHERE (m.is_new_release = 1 OR m.is_pre_order = 1) AND COALESCE(m.hidden, 0) = 0
     ORDER BY m.is_pre_order DESC, m.name`,
  )) as Row[];

  // group by universe, in label order
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = r.game ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }
  const orderedGroups = Object.keys(GAME_LABELS)
    .filter((slug) => groups.has(slug))
    .map((slug) => ({ slug, items: groups.get(slug)! }));
  // any group not in the label map goes last
  for (const [slug, items] of groups) {
    if (!GAME_LABELS[slug]) orderedGroups.push({ slug, items });
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-display font-bold">New Releases</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          The latest Games Workshop kits and current pre-orders, straight from GW&apos;s
          catalogue. Updated with every sync.
        </p>
      </div>

      {orderedGroups.length === 0 && (
        <div className="border-t border-slate-300 py-16 text-center dark:border-slate-700">
          <p className="text-lg text-slate-600 dark:text-slate-300">
            Nothing brand-new right now.
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Check back after GW&apos;s next weekly reveal, or browse the{" "}
            <Link href="/price-lookup" className="underline">full catalogue</Link>.
          </p>
        </div>
      )}

      {orderedGroups.map(({ slug, items }) => (
        <section key={slug} aria-labelledby={`nr-${slug}`}>
          <h2
            id={`nr-${slug}`}
            className="border-b border-slate-300 pb-2 text-2xl font-display font-semibold dark:border-slate-700"
          >
            {gameLabel(slug)}
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((r) => (
              <Link
                key={r.product_id}
                href={`/product/${r.product_id}`}
                className="group border border-slate-300 bg-white p-3 transition-colors hover:border-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-400"
              >
                <div className="aspect-square overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imgSrc(r.image)}
                    alt={r.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                  />
                </div>
                <div className="mt-2 space-y-1">
                  {r.is_pre_order === 1 && (
                    <span className="inline-block border border-amber-500 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                      Pre-order
                    </span>
                  )}
                  <div className="font-medium leading-snug group-hover:underline">{r.name}</div>
                  {r.faction && r.faction !== "No Faction / Misc" && (
                    <div className="text-xs text-slate-500 dark:text-slate-400">{r.faction}</div>
                  )}
                  <div className="text-sm font-bold text-green-700 dark:text-emerald-300">
                    {r.best_price != null ? `from ${fmt(r.best_price)}` : "no prices yet"}
                  </div>
                  {r.best_price != null && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {deliveryEstimate(parseShipping(r.best_shipping), r.best_price)}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
