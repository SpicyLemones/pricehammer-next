"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  getCart,
  setQty,
  setStore,
  removeFromCart,
  clearCart,
  onCartChange,
  type CartItem,
} from "@/lib/cart";

type Shipping = {
  tag?: string | null;
  deal?: string | null;
  flat?: number | null;
  freeOver?: number | null;
  note?: string | null;
};
type Retailer = { store: string; price: number | null; url: string | null; shipping?: Shipping };
type Product = {
  id: string;
  name: string;
  image?: string | null;
  retailers: Retailer[];
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

type ResolvedLine = {
  item: CartItem;
  product: Product;
  offers: Retailer[]; // priced offers, cheapest first
  chosen: Retailer | null;
};

export function CartClient() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [loading, setLoading] = useState(true);
  const [openedCount, setOpenedCount] = useState(0);

  useEffect(() => {
    setItems(getCart());
    return onCartChange(() => setItems(getCart()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lookup-data", { cache: "no-store" });
        const data: { products: Product[] } = await res.json();
        if (!cancelled) {
          setProducts(new Map(data.products.map((p) => [p.id, p])));
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lines: ResolvedLine[] = useMemo(() => {
    const out: ResolvedLine[] = [];
    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) continue;
      const offers = [...(product.retailers ?? [])]
        .filter((r) => Number.isFinite(Number(r.price)))
        .sort((a, b) => Number(a.price) - Number(b.price));
      const chosen: Retailer | null =
        (item.store ? offers.find((o) => o.store === item.store) : undefined) ??
        offers[0] ??
        null;
      out.push({ item, product, offers, chosen });
    }
    return out;
  }, [items, products]);

  // ---- totals ----
  const totals = useMemo(() => {
    const itemsSubtotal = lines.reduce(
      (sum, l) => sum + (l.chosen?.price ?? 0) * l.item.qty,
      0,
    );

    // group by chosen store for delivery
    const byStore = new Map<string, { subtotal: number; shipping?: Shipping }>();
    for (const l of lines) {
      if (!l.chosen) continue;
      const entry = byStore.get(l.chosen.store) ?? { subtotal: 0, shipping: l.chosen.shipping };
      entry.subtotal += (l.chosen.price ?? 0) * l.item.qty;
      byStore.set(l.chosen.store, entry);
    }

    let delivery = 0;
    const deliveryLines: { store: string; label: string; amount: number | null }[] = [];
    for (const [store, { subtotal, shipping }] of byStore) {
      const freeOver = shipping?.freeOver ?? null;
      const flat = shipping?.flat ?? null;
      if (freeOver != null && subtotal >= freeOver) {
        deliveryLines.push({ store, label: `Free (order over ${fmt(freeOver)})`, amount: 0 });
      } else if (flat != null) {
        delivery += flat;
        deliveryLines.push({ store, label: `Flat rate`, amount: flat });
      } else {
        const note = shipping?.note ?? "delivery cost not published — check at the store";
        const hint =
          freeOver != null
            ? `${note} (free over ${fmt(freeOver)} — you're ${fmt(freeOver - subtotal)} away)`
            : note;
        deliveryLines.push({ store, label: hint, amount: null });
      }
    }
    const hasUnknown = deliveryLines.some((d) => d.amount === null);
    return { itemsSubtotal, delivery, deliveryLines, hasUnknown, total: itemsSubtotal + delivery };
  }, [lines]);

  if (loading && items.length > 0) {
    return <p className="py-16 text-center text-slate-500 dark:text-slate-400">Loading cart…</p>;
  }

  if (items.length === 0) {
    return (
      <div className="border-t border-slate-300 py-16 text-center dark:border-slate-700">
        <p className="text-lg text-slate-600 dark:text-slate-300">Your cart is empty.</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Add kits from the <Link href="/price-lookup" className="underline">price lookup</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-display font-bold">Cart</h1>
        <button
          className="text-sm text-slate-500 underline hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          onClick={() => clearCart()}
        >
          Clear cart
        </button>
      </div>

      {/* Lines */}
      <div className="divide-y divide-slate-200 border-y border-slate-300 dark:divide-slate-800 dark:border-slate-700">
        {lines.map(({ item, product, offers, chosen }) => (
          <div
            key={item.productId}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-3 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <Link href={`/product/${product.id}`} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imgSrc(product.image)}
                alt={product.name}
                className="h-14 w-14 object-contain sm:h-16 sm:w-16"
                loading="lazy"
              />
            </Link>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/product/${product.id}`} className="font-medium hover:underline">
                  {product.name}
                </Link>
                {offers[0] && chosen && offers[0].store === chosen.store && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">best price</span>
                )}
              </div>

              {offers.length > 0 ? (
                <select
                  className="w-full max-w-md rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
                  value={chosen?.store ?? ""}
                  onChange={(e) => setStore(item.productId, e.target.value)}
                  aria-label={`Store for ${product.name}`}
                >
                  {offers.map((o) => (
                    <option key={o.store} value={o.store}>
                      {o.store} — {fmt(Number(o.price))}
                      {o === offers[0] ? " (cheapest)" : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-slate-400">No prices available right now.</p>
              )}

              <div className="flex items-center gap-3">
                <div className="inline-flex items-center border border-slate-300 dark:border-slate-600">
                  <button
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setQty(item.productId, item.qty - 1)}
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center text-sm tabular-nums">{item.qty}</span>
                  <button
                    className="px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setQty(item.productId, item.qty + 1)}
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
                <button
                  className="text-sm text-slate-500 underline hover:text-red-600 dark:text-slate-400"
                  onClick={() => removeFromCart(item.productId)}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="col-start-2 text-left font-bold tabular-nums sm:col-start-3 sm:text-right">
              {chosen ? fmt(Number(chosen.price) * item.qty) : "—"}
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="ml-auto max-w-md space-y-2">
        <div className="flex justify-between text-sm">
          <span>Items</span>
          <span className="tabular-nums">{fmt(totals.itemsSubtotal)}</span>
        </div>
        {totals.deliveryLines.map((d) => (
          <div key={d.store} className="flex justify-between gap-4 text-sm">
            <span className="text-slate-600 dark:text-slate-300">
              Delivery — {d.store}
              {d.amount === null && (
                <span className="block text-xs text-amber-700 dark:text-amber-400">{d.label}</span>
              )}
              {d.amount === 0 && (
                <span className="block text-xs text-emerald-700 dark:text-emerald-400">{d.label}</span>
              )}
            </span>
            <span className="tabular-nums">{d.amount === null ? "TBC" : fmt(d.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-bold dark:border-slate-700">
          <span>Estimated total{totals.hasUnknown ? "*" : ""}</span>
          <span className="tabular-nums">{fmt(totals.total)}</span>
        </div>
        {totals.hasUnknown && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            * excludes delivery for stores that don&apos;t publish a fixed rate — check those at
            the store&apos;s checkout.
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button
            variant="default"
            onClick={() => {
              const urls = lines
                .map((l) => l.chosen?.url)
                .filter((u): u is string => Boolean(u));
              // one window.open per URL; browsers may keep only the first
              // unless the user allows pop-ups for this site
              urls.forEach((u) => window.open(u, "_blank", "noopener,noreferrer"));
              if (urls.length > 1) {
                setOpenedCount(urls.length);
                setTimeout(() => setOpenedCount(0), 6000);
              }
            }}
          >
            Open all store pages ({lines.filter((l) => l.chosen?.url).length})
          </Button>
          <Button asChild variant="outline">
            <Link href="/price-lookup">Keep browsing</Link>
          </Button>
        </div>
        {openedCount > 1 && (
          <p className="text-right text-xs text-slate-500 dark:text-slate-400">
            Opened {openedCount} tabs — if only one appeared, allow pop-ups for this site and
            try again.
          </p>
        )}
      </div>
    </div>
  );
}
