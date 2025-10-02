"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "./ui/select";
import { Separator } from "./ui/separator";
import { Search, ExternalLink, X } from "lucide-react";

// Manual metadata (fallback + fields like game/faction/category/points/image)
import {
  Products as ManualProducts,
} from "../../../data/db/Product";

// ---------- Types ----------
type Retailer = { store: string; price: number | null; url: string | null };
type Product = {
  id: string;
  name: string;
  game?: "warhammer40k" | "ageofsigmar" | "killteam" | "both";
  faction?: string;
  category?: string;
  points?: number;
  image?: string | null;
  retailers: Retailer[];
};

// ---------- Image helper ----------
const PLACEHOLDER = "/logo/logo.png";
function imgSrc(image?: string | null) {
  const val = image?.trim();
  if (!val) return PLACEHOLDER; // no value → logo
  if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/")) {
    return val; // absolute or rooted
  }
  // treat as filename in /public/images/product
  return `/images/product/${val}`;
}

// ---------- Currency ----------
const fmtAUD = (n?: number | null) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const withSymbol = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    currencyDisplay: "symbol",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(v);
  return `${withSymbol} AUD`;
};

// ---------- Faction groups (unchanged) ----------
const FACTION_GROUPS: Record<
  "No Faction" | "Imperium" | "Chaos" | "Chaos (AoS)" | "Xenos" | "Order" | "Destruction" | "Death",
  string[]
> = {
  "No Faction": ["No Faction / Misc"],
  Imperium: [
    "Adepta Sororitas","Adeptus Custodes","Adeptus Mechanicus","Adeptus Titanicus",
    "Astra Militarum","Grey Knights","Imperial Agents","Imperial Knights","Space Marines",
  ],
  Chaos: [
    "Chaos Daemons","Chaos Knights","Chaos Space Marines","Death Guard",
    "Emperor’s Children","Thousand Sons","World Eaters"
  ],
  Xenos: [
    "Aeldari","Drukhari","Genestealer Cults","Leagues of Votann","Necrons","Orks","T’au Empire","Tyranids",
  ],
  Order: [
    "Cities of Sigmar","Daughters of Khaine","Fyreslayers","Idoneth Deepkin","Kharadron Overlords",
    "Lumineth Realm-lords","Seraphon","Stormcast Eternals","Sylvaneth",
  ],
  "Chaos (AoS)" : [
    "Beasts of Chaos","Blades of Khorne","Disciples of Tzeentch","Hedonites of Slaanesh","Maggotkin of Nurgle",
    "Skaven","Slaves to Darkness"
  ],
  Destruction: [
    "Bonesplitterz","Gloomspite Gitz","Ironjawz","Kruleboyz","Ogor Mawtribes","Sons of Behemat",
  ],
  Death: [
    "Flesh-eater Courts","Nighthaunt","Ossiarch Bonereapers","Soulblight Gravelords",
  ],
};

// ---------- Report wrong (unchanged) ----------
async function reportWrong(
  link?: string | null,
  sellerName?: string | null,
  productName?: string | null
) {
  const cleanLink = (link ?? "").trim();
  if (!cleanLink) {
    alert("No link to report for this retailer.");
    return;
  }
  const reasonInput = window.prompt("What's wrong with this link/price? (optional)");
  if (reasonInput === null) return; // user cancelled
  const reason = reasonInput.trim();

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

// ---------- Sorting helpers (unchanged) ----------
type SortKey = "featured" | "price-asc" | "price-desc" | "points-asc" | "points-desc";

const bestPriceOrNull = (p: Product) => {
  const nums = p.retailers?.map((r) => Number(r?.price)).filter((v) => Number.isFinite(v)) ?? [];
  return nums.length ? Math.min(...nums) : null;
};
const hasAnyPrice = (p: Product) => bestPriceOrNull(p) !== null;
const cmpPriceAsc = (a: Product, b: Product) => {
  const A = bestPriceOrNull(a);
  const B = bestPriceOrNull(b);
  if (A === null && B === null) return 0;
  if (A === null) return 1;
  if (B === null) return -1;
  return A - B;
};
const cmpPriceDesc = (a: Product, b: Product) => {
  const A = bestPriceOrNull(a);
  const B = bestPriceOrNull(b);
  if (A === null && B === null) return 0;
  if (A === null) return 1;
  if (B === null) return -1;
  return B - A;
};
const sample = <T,>(arr: T[], n: number) => {
  if (n >= arr.length) return [...arr];
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
};

// ---------- Component ----------
export function ProductLookup() {
  // Start with manual products (no retailers) so UI renders immediately.
  const [sourceProducts, setSourceProducts] = useState<Product[]>(
    () => ManualProducts.map((p) => ({ ...p, retailers: [] }))
  );
  const [queryInput, setQueryInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [selectedFaction, setSelectedFaction] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("featured");
  const featuredIdsRef = useRef<string[] | null>(null);

  // Fetch live retailers + (same) metadata from the DB-backed API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lookup-data", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data: { products: Product[] } = await res.json();
        if (!cancelled && Array.isArray(data?.products)) {
          setSourceProducts(data.products);
        }
      } catch (e) {
        console.warn("Falling back to manual products only (no DB retailers).", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const factions = useMemo(
    () => [...new Set(sourceProducts.map((p) => p.faction).filter(Boolean))] as string[],
    [sourceProducts]
  );
  const categories = useMemo(
    () => [...new Set(sourceProducts.map((p) => p.category).filter(Boolean))] as string[],
    [sourceProducts]
  );

  const factionSet = useMemo(() => new Set(factions), [factions]);
  const groupedFactions = useMemo(() => {
    return (Object.entries(FACTION_GROUPS) as [keyof typeof FACTION_GROUPS, string[]][])
      .map(([group, list]) => ({ group, items: list.filter((f) => factionSet.has(f)) }))
      .filter((g) => g.items.length > 0);
  }, [factionSet]);

  const games = ["warhammer40k", "ageofsigmar"] as const;

  const hasQueryOrFilters =
    searchTerm.trim().length > 0 ||
    selectedGame !== "all" ||
    selectedFaction !== "all" ||
    selectedCategory !== "all" ||
    sortBy !== "featured";

  // 1) Filtering
  const filteredAll = useMemo(() => {
    return (sourceProducts as Product[]).filter((p) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.faction?.toLowerCase?.() ?? "").includes(term);

      const matchesGame = selectedGame === "all" || p.game === (selectedGame as any);
      const matchesFaction = selectedFaction === "all" || p.faction === selectedFaction;
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;

      return matchesSearch && matchesGame && matchesFaction && matchesCategory;
    });
  }, [searchTerm, selectedGame, selectedFaction, selectedCategory, sourceProducts]);

  // 2) initial featured (first load only): 5 random with prices
  const initialFeatured = useMemo(() => {
    if (hasQueryOrFilters) return [];
    const withPrices = (sourceProducts as Product[]).filter(hasAnyPrice);
    const chosen = sample(withPrices, 5);
    featuredIdsRef.current = chosen.map((c) => c.id);
    return chosen;
  }, [hasQueryOrFilters, sourceProducts]);

  // 3) working set
  const workingSet: Product[] = hasQueryOrFilters ? filteredAll : initialFeatured;

  // 4) sorting
  const sorted = useMemo(() => {
    const arr = [...workingSet];
    switch (sortBy) {
      case "price-asc":
        arr.sort(cmpPriceAsc);
        break;
      case "price-desc":
        arr.sort(cmpPriceDesc);
        break;
      case "points-asc":
        arr.sort((a, b) => (a.points ?? Infinity) - (b.points ?? Infinity));
        break;
      case "points-desc":
        arr.sort((a, b) => (b.points ?? -Infinity) - (a.points ?? -Infinity));
        break;
      case "featured":
      default:
        if (!hasQueryOrFilters && featuredIdsRef.current) {
          const order = new Map(featuredIdsRef.current.map((id, i) => [id, i]));
          arr.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
        }
        break;
    }
    return arr;
  }, [workingSet, sortBy, hasQueryOrFilters]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Product Lookup</h1>
        <p>Compare prices for Wargaming kits across AU retailers, including Warhammer.</p>
        <p className="text-muted-foreground">Search for units and compare prices across retailers</p>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        {/* search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearchTerm(queryInput.trim());
          }}
          className="relative flex-1 min-w-[300px] group focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-1 rounded-md"
        >
          <Input
            placeholder="Search units, factions, or keywords..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="pr-12 bg-white dark:bg-slate-800"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all duration-150 hover:bg-slate-100 dark:hover:bg-slate-800/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Search className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
        </form>

        {/* game */}
        <Select value={selectedGame} onValueChange={setSelectedGame}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-slate-800 ">
            <SelectValue placeholder="All Games" />
          </SelectTrigger>
          <SelectContent className="w-[180px] bg-white dark:bg-slate-800">
            <SelectItem value="all">All Games</SelectItem>
            {(["warhammer40k", "ageofsigmar"] as const).map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* faction */}
        <Select value={selectedFaction} onValueChange={setSelectedFaction}>
          <SelectTrigger className="w-[220px] bg-white dark:bg-slate-800">
            <SelectValue placeholder="All Factions" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            className="w-[280px] max-h-[70vh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-800 [scrollbar-gutter:stable] border"
          >
            <SelectItem value="all">All Factions</SelectItem>
            {groupedFactions.map(({ group, items }) => (
              <SelectGroup key={group}>
                <SelectLabel className="px-2 pt-2 text-[11px] uppercase tracking-wide text-slate-500">
                  {group}
                </SelectLabel>
                {items.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
                <Separator className="my-2" />
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        {/* category */}
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="w-[180px] bg-white dark:bg-slate-800">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent className="w-[180px] bg-white dark:bg-slate-800">
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* sort */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-[200px] bg-white dark:bg-slate-800">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent className="w-[200px] bg-white dark:bg-slate-800">
            <SelectItem value="featured">Featured</SelectItem>
            <SelectItem value="price-asc">Price (low → high)</SelectItem>
            <SelectItem value="price-desc">Price (high → low)</SelectItem>
            <SelectItem value="points-asc">Points (low → high)</SelectItem>
            <SelectItem value="points-desc">Points (high → low)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      <div className="grid gap-4">
        {sorted.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No products found.</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------
   Card (with zoom modal & top-3 offers) — unchanged UX
--------------------------------------------------*/
function ProductCard({ product }: { product: Product }) {
  const [showAll, setShowAll] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  const productUrl = `/product/${product.id}`;
  const sortedRetailers = [...(product.retailers ?? [])]
    .filter(r => r && (r.price === 0 || Number.isFinite(Number(r.price))))
    .sort((a, b) => (Number(a.price) - Number(b.price)));

  const best = sortedRetailers[0];
  const highest = sortedRetailers[sortedRetailers.length - 1];
  const visible = showAll ? sortedRetailers : sortedRetailers.slice(0, 3);

  const thumb = imgSrc(product.image || undefined);

  return (
    <>
      <Card className="overflow-hidden bg-white shadow-md border border-slate-200">
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Image */}
            <div className="w-full min-h md:w-40 flex-shrink-0">
              <Link href={productUrl} className="block">
                <div
                  className="aspect-square overflow-hidden rounded-md border bg-white cursor-pointer"
                  aria-label={`Open ${product.name}`}
                  onClick={(e) => { e.preventDefault(); setZoomed(true); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setZoomed(true);} }}
                  role="button"
                  tabIndex={0}
                >
                  <img
                    src={thumb}
                    alt={product.name}
                    className="h-full w-full object-contain"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = PLACEHOLDER;
                    }}
                  />
                </div>
              </Link>
            </div>

            {/* Text meta */}
            <div className="flex-1 flex flex-col justify-between">
              <div>
                <CardTitle className="font-display text-lg md:text-xl">
                  <Link href={productUrl} className="hover:underline">
                    {product.name || "Unnamed Product"}
                  </Link>
                </CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="outline">{product.faction || "Unknown Faction"}</Badge>
                  <span className="text-slate-600">{product.category || "Uncategorized"}</span>
                  {typeof product.points === "number" && product.points > 0 ? (
                    <span className="text-slate-600">• {product.points} pts</span>
                  ) : (
                    <span className="text-slate-400">• Points TBD</span>
                  )}
                </div>
              </div>
            </div>

            {/* Best price with “highest” slashed if different (AUD) */}
            <div className="text-right md:self-start">
              <div className="text-xs text-slate-500">Best Price</div>
              {best ? (
                <div className="leading-tight">
                  {highest && highest.price !== best.price && (
                    <div className="text-base md:text-lg text-red-600 line-through">
                      {fmtAUD(highest.price)}
                    </div>
                  )}
                  <div className="text-4xl md:text-5xl font-extrabold text-green-600">
                    {fmtAUD(best.price)}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400">No prices</div>
              )}
            </div>
          </div>
        </CardHeader>

        <Separator className="my-4" />

        {/* Prices */}
        <CardContent className="pt-0">
          <div className="mb-3 font-medium">Available at:</div>

          {visible.length > 0 ? (
            <div className="rounded-md border divide-y">
              {visible.map((r, idx) => (
                <div
                  key={`${r.store}-${idx}`}
                  className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2"
                >
                  <div className="font-medium">{r.store || "Unknown Store"}</div>
                  <div className="font-bold tabular-nums">
                    {Number.isFinite(Number(r.price)) ? fmtAUD(r.price) : "—"}
                  </div>
                  <div>
                    {r.url ? (
                      <Button size="sm" variant="outline" asChild>
                        <a href={r.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        No Link
                      </Badge>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => reportWrong(r.url, r.store, product.name)}
                      title="Report wrong price/link"
                    >
                      Report
                    </Button>
                  </div>
                </div>
              ))}

              {/* Expand/collapse */}
              {sortedRetailers.length > 3 && !showAll && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowAll(true)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowAll(true)}
                  className="px-3 py-2 text-center text-blue-700 hover:bg-blue-50 cursor-pointer select-none"
                  title={`Show all ${sortedRetailers.length} offers`}
                >
                  Show all {sortedRetailers.length} offers
                </div>
              )}
              {sortedRetailers.length > 3 && showAll && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setShowAll(false)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setShowAll(false)}
                  className="px-3 py-2 text-center text-slate-700 hover:bg-slate-50 cursor-pointer select-none"
                  title="Show Less"
                >
                  Show Less
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-400">No retailers yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Zoom modal */}
      {zoomed &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
            onClick={() => setZoomed(false)}
          >
            <div
              className="relative bg-white rounded-lg shadow-lg p-4 flex items-center justify-center max-w-[90vw] max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoomed(false)}
                className="absolute top-3 right-3 bg-white rounded-full p-1 shadow hover:bg-slate-100"
                aria-label="Close image preview"
              >
                <X className="h-5 w-5 text-slate-700" />
              </button>
              <img
                src={imgSrc(product.image || undefined)}
                alt={product.name}
                className="max-h-[85vh] max-w-[85vw] object-contain"
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
