"use client";
import { useEffect, useMemo, useState } from "react";
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
import { GAME_LABELS, gameLabel } from "@/lib/game-labels";
import { addToCart } from "@/lib/cart";

// Manual metadata (fallback + fields like game/faction/category/points/image)
// ---------- Types ----------
type RetailerShipping = {
  tag?: string | null;
  deal?: string | null;
  flat?: number | null;
  freeOver?: number | null;
  note?: string | null;
};
type Retailer = {
  store: string;
  price: number | null;
  url: string | null;
  shipping?: RetailerShipping;
};
type Product = {
  id: string;
  name: string;
  game?: string;
  games?: string[];
  faction?: string;
  factions?: string[];
  image?: string | null;
  hidden?: boolean;
  retailers: Retailer[];
};

// every universe tag a product carries (multi-system kits have several)
const gamesOf = (p: Product): string[] =>
  p.games?.length ? p.games : p.game ? [p.game] : [];
// every faction a product belongs to (Chaos kits often span several)
const factionsOf = (p: Product): string[] =>
  p.factions?.length ? p.factions : p.faction ? [p.faction] : [];

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
type SortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "best-deal-desc"
  | "best-deal-asc";

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
const bestDealGap = (p: Product) => {
  const nums =
    p.retailers?.map((r) => Number(r?.price)).filter((v) => Number.isFinite(v)) ?? [];
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return max - min;
};
const cmpBestDealDesc = (a: Product, b: Product) => {
  const A = bestDealGap(a);
  const B = bestDealGap(b);
  if (A === null && B === null) return 0;
  if (A === null) return 1;
  if (B === null) return -1;
  return B - A;
};
const cmpBestDealAsc = (a: Product, b: Product) => {
  const A = bestDealGap(a);
  const B = bestDealGap(b);
  if (A === null && B === null) return 0;
  if (A === null) return 1;
  if (B === null) return -1;
  return A - B;
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

const PAGE_SIZE = 24;

// ---------- Component ----------
export function ProductLookup() {
  const [sourceProducts, setSourceProducts] = useState<Product[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [selectedFaction, setSelectedFaction] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("featured");
  // Results only appear after a deliberate search or filter choice
  const [hasSearched, setHasSearched] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // the guided browse: universe first, then faction, then everything in it
  const [wizardStep, setWizardStep] = useState<"universe" | "faction" | null>(null);

  // Fetch live retailers + (same) metadata from the DB-backed API
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/lookup-data", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const data: { products: Product[] } = await res.json();
        if (!cancelled && Array.isArray(data?.products)) {
          const visible = data.products.filter((product) => product.hidden !== true);
          setSourceProducts(visible);
        }
      } catch (e) {
        console.warn("Falling back to manual products only (no DB retailers).", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // universes present in the data (all tags, not just primaries), in label order
  const gamesPresent = useMemo(() => {
    const present = new Set(sourceProducts.flatMap(gamesOf));
    return Object.keys(GAME_LABELS).filter((slug) => present.has(slug));
  }, [sourceProducts]);

  // factions scoped to the selected universe — pick 40k and you will never
  // see an Age of Sigmar faction in the list, and vice versa
  const factions = useMemo(() => {
    const pool =
      selectedGame === "all"
        ? sourceProducts
        : sourceProducts.filter((p) => gamesOf(p).includes(selectedGame));
    return [...new Set(pool.flatMap(factionsOf).filter(Boolean))];
  }, [sourceProducts, selectedGame]);

  // if the chosen faction falls outside the new universe scope, reset it
  useEffect(() => {
    if (selectedFaction !== "all" && !factions.includes(selectedFaction)) {
      setSelectedFaction("all");
    }
  }, [factions, selectedFaction]);

  const factionSet = useMemo(() => new Set(factions), [factions]);
  const groupedFactions = useMemo(() => {
    const grouped = (Object.entries(FACTION_GROUPS) as [string, string[]][])
      .map(([group, list]) => ({ group, items: list.filter((f) => factionSet.has(f)) }))
      .filter((g) => g.items.length > 0);
    // anything GW names that our hardcoded groups don't know about
    const known = new Set(Object.values(FACTION_GROUPS).flat());
    const other = factions.filter((f) => !known.has(f)).sort();
    if (other.length) grouped.push({ group: "Other", items: other });
    return grouped;
  }, [factionSet, factions]);

  // 1) Filtering — only meaningful once a search has been committed
  const filteredAll = useMemo(() => {
    return (sourceProducts as Product[]).filter((p) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.faction?.toLowerCase?.() ?? "").includes(term);

      const matchesGame = selectedGame === "all" || gamesOf(p).includes(selectedGame);
      const matchesFaction = selectedFaction === "all" || factionsOf(p).includes(selectedFaction);

      return matchesSearch && matchesGame && matchesFaction;
    });
  }, [searchTerm, selectedGame, selectedFaction, sourceProducts]);

  // 2) sorting
  const sorted = useMemo(() => {
    const arr = [...filteredAll];
    switch (sortBy) {
      case "price-asc":
        arr.sort(cmpPriceAsc);
        break;
      case "price-desc":
        arr.sort(cmpPriceDesc);
        break;
      case "best-deal-desc":
        arr.sort(cmpBestDealDesc);
        break;
      case "best-deal-asc":
        arr.sort(cmpBestDealAsc);
        break;
      default:
        break;
    }
    return arr;
  }, [filteredAll, sortBy]);

  // 3) cap rendering — 1,400 cards at once helps nobody
  const shown = sorted.slice(0, visibleCount);

  const commitSearch = () => {
    setSearchTerm(queryInput.trim());
    setHasSearched(true);
    setVisibleCount(PAGE_SIZE);
  };
  const commitFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setHasSearched(true);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold">Product Lookup</h1>
        <p>Compare prices for Wargaming kits across AU retailers, including Warhammer.</p>
        <p className="text-muted-foreground">Search for units and compare prices across retailers</p>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {/* search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            commitSearch();
          }}
          className="flex w-full gap-2 sm:min-w-[300px] sm:flex-1"
        >
          <Input
            placeholder="Search units, factions, or keywords..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="bg-white dark:bg-slate-800"
          />
          <Button type="submit" variant="default" className="shrink-0 px-4">
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search</span>
          </Button>
        </form>

        {/* universe */}
        <Select value={selectedGame} onValueChange={commitFilter(setSelectedGame)}>
          <SelectTrigger className="w-full bg-white dark:bg-slate-800 sm:w-[180px]">
            <SelectValue placeholder="All Universes" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-800">
            <SelectItem value="all">All Universes</SelectItem>
            {gamesPresent.map((slug) => (
              <SelectItem key={slug} value={slug}>{GAME_LABELS[slug]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* faction */}
        <Select value={selectedFaction} onValueChange={commitFilter(setSelectedFaction)}>
          <SelectTrigger className="w-full bg-white dark:bg-slate-800 sm:w-[220px]">
            <SelectValue placeholder="All Factions" />
          </SelectTrigger>
          <SelectContent
            position="popper"
            side="bottom"
            align="start"
            className="max-h-[70vh] w-[280px] overflow-y-auto overscroll-contain border bg-white [scrollbar-gutter:stable] dark:bg-slate-800"
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

        {/* sort */}
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="w-full bg-white dark:bg-slate-800 sm:w-[200px]">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-800">
            <SelectItem value="featured">Relevance</SelectItem>
            <SelectItem value="price-asc">Price (low → high)</SelectItem>
            <SelectItem value="price-desc">Price (high → low)</SelectItem>
            <SelectItem value="best-deal-desc">Best deals (largest savings)</SelectItem>
            <SelectItem value="best-deal-asc">Best deals (smallest savings)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results */}
      {!hasSearched ? (
        <div className="border-t border-slate-300 py-16 dark:border-slate-700">
          <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
            {wizardStep === null && (
              <>
                <p className="text-lg text-slate-600 dark:text-slate-300">Nothing searched yet.</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Search for a unit, or pick a universe or faction to browse.
                </p>
                <Button className="mt-5 px-6" onClick={() => setWizardStep("universe")}>
                  Not sure where to start?
                </Button>
              </>
            )}

            {wizardStep === "universe" && (
              <>
                <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                  What universe are you playing?
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {gamesPresent.map((slug) => (
                    <Button
                      key={slug}
                      variant="outline"
                      className="px-5"
                      onClick={() => {
                        setSelectedGame(slug);
                        setWizardStep("faction");
                      }}
                    >
                      {GAME_LABELS[slug]}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    className="px-5"
                    onClick={() => {
                      setSelectedGame("all");
                      setSelectedFaction("all");
                      setHasSearched(true);
                      setVisibleCount(PAGE_SIZE);
                      setWizardStep(null);
                    }}
                  >
                    Show me everything
                  </Button>
                </div>
                <button
                  className="mt-4 text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={() => setWizardStep(null)}
                >
                  Back
                </button>
              </>
            )}

            {wizardStep === "faction" && (
              <>
                <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
                  What faction are you looking for?
                </p>
                <div className="mt-4 flex max-h-[50vh] flex-wrap justify-center gap-2 overflow-y-auto">
                  <Button
                    variant="default"
                    className="px-5"
                    onClick={() => {
                      setSelectedFaction("all");
                      setHasSearched(true);
                      setVisibleCount(PAGE_SIZE);
                      setWizardStep(null);
                    }}
                  >
                    All of {selectedGame === "all" ? "them" : GAME_LABELS[selectedGame] ?? "them"}
                  </Button>
                  {groupedFactions.flatMap(({ items }) => items).map((f) => (
                    <Button
                      key={f}
                      variant="outline"
                      onClick={() => {
                        setSelectedFaction(f);
                        setHasSearched(true);
                        setVisibleCount(PAGE_SIZE);
                        setWizardStep(null);
                      }}
                    >
                      {f}
                    </Button>
                  ))}
                </div>
                <button
                  className="mt-4 text-xs text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={() => setWizardStep("universe")}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {sorted.length} result{sorted.length === 1 ? "" : "s"}
            {sorted.length > shown.length ? ` — showing ${shown.length}` : ""}
          </p>
          <div className="grid gap-4">
            {shown.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
            {sorted.length === 0 && (
              <div className="border-t border-slate-300 py-12 text-center text-muted-foreground dark:border-slate-700">
                No products found. Try different keywords or fewer filters.
              </div>
            )}
          </div>
          {sorted.length > shown.length && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}>
                Show more ({sorted.length - shown.length} remaining)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------
   Card (with zoom modal & top-3 offers) — unchanged UX
--------------------------------------------------*/
function ProductCard({ product }: { product: Product }) {
  const [showAll, setShowAll] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addToCart(product.id);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

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
      <Card className="overflow-hidden border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        <CardHeader className="pb-0">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Image */}
            <div className="w-28 sm:w-32 md:w-40 flex-shrink-0">
              <Link href={productUrl} className="block">
                <div
                  className="aspect-square cursor-pointer overflow-hidden bg-white dark:bg-slate-950/40"
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
                  {gamesOf(product).map((slug) => (
                    <Badge key={slug} variant="outline">{gameLabel(slug)}</Badge>
                  ))}
                  {product.faction && product.faction !== "No Faction / Misc" && (
                    <span className="text-slate-600 dark:text-slate-300">{product.faction}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Best price with “highest” slashed if different (AUD) */}
            <div className="text-left md:text-right md:self-start">
              <div className="text-xs text-slate-500 dark:text-slate-400">Best Price</div>
              {best ? (
                <div className="leading-tight">
                  {highest && highest.price !== best.price && (
                    <div className="text-base text-red-700 line-through dark:text-red-400">
                      {fmtAUD(highest.price)}
                    </div>
                  )}
                  <div className="text-3xl md:text-4xl font-extrabold text-green-700 dark:text-emerald-300">
                    {fmtAUD(best.price)}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 dark:text-slate-500">No prices</div>
              )}
              {best && (
                <Button
                  size="sm"
                  variant={added ? "secondary" : "default"}
                  className="mt-2"
                  onClick={handleAdd}
                >
                  {added ? "Added ✓" : "Add to cart"}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <Separator className="my-4 opacity-70 dark:opacity-60" />

        {/* Prices */}
        <CardContent className="pt-0">
          <div className="mb-3 font-medium">Available at:</div>

          {visible.length > 0 ? (
            <div className="divide-y divide-slate-200 border-t border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {visible.map((r, idx) => (
                <div
                  key={`${r.store}-${idx}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 py-2 sm:gap-3"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{r.store || "Unknown Store"}</span>
                    {r.shipping?.tag && (
                      <span
                        className="group relative inline-flex cursor-help items-center border border-slate-300 px-1.5 py-0.5 text-xs text-slate-600 dark:border-slate-600 dark:text-slate-300"
                        tabIndex={0}
                      >
                        {r.shipping.tag}
                        <span
                          role="tooltip"
                          className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden w-64 border border-slate-300 bg-white p-2 text-xs leading-snug text-slate-700 group-hover:block group-focus-visible:block dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        >
                          {r.shipping.deal ?? r.shipping.tag}
                        </span>
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-bold tabular-nums sm:text-base">
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
                  className="select-none px-3 py-2 text-center text-blue-700 transition-colors hover:bg-blue-50/70 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
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
                  className="select-none px-3 py-2 text-center text-slate-700 transition-colors hover:bg-slate-50/70 dark:text-slate-200 dark:hover:bg-slate-800/60"
                  title="Show Less"
                >
                  Show Less
                </div>
              )}
            </div>
          ) : (
            <div className="text-slate-400 dark:text-slate-500">No retailers yet.</div>
          )}
        </CardContent>
      </Card>

      {/* Zoom modal */}
      {zoomed &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80"
            onClick={() => setZoomed(false)}
          >
            <div
              className="relative flex max-h-[90vh] max-w-[90vw] items-center justify-center rounded-md border border-slate-300 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setZoomed(false)}
                className="absolute right-3 top-3 border border-slate-300 bg-white p-1 transition-colors hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
                aria-label="Close image preview"
              >
                <X className="h-5 w-5 text-slate-700 dark:text-slate-200" />
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
