"use client";
import { useMemo, useRef, useState } from "react";
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

// ⬇️ Import manual metadata (no retailers)
// Manual metadata
import {
  Products as ManualProducts,
  type Product,
} from "../../../data/db/Product";

// Generated retailers map (untyped literal)
import { RetailersByProduct as RetailersRaw } from "../../../data/db/Data";


//img helper
const PLACEHOLDER = "/logo/logo.png";

function imgSrc(image?: string | null) {
  const val = image?.trim();
  if (!val) return PLACEHOLDER; // no value → use logo
  if (val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/")) {
    return val; // absolute or remote
  }
  return `/images/${val}`; // treat as filename in /public/images
}


//placeholder




// Give it a usable type for indexing by string ids
type Retailer = { store: string; price: number; inStock: boolean; url: string | null };
const RetailersByProduct = RetailersRaw as unknown as Record<string, Retailer[]>;

// Merge manual metadata with generated retailers
const sourceProducts: Product[] = ManualProducts.map((p) => ({
  ...p,
  retailers: RetailersByProduct[p.id] ?? [],
}));


/* ------------------------------------------------
   Currency formatting: "$120 AUD" or "$80.75 AUD"
--------------------------------------------------*/
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


// Super-groups
const FACTION_GROUPS: Record<
  "No Faction" | "Imperium" | "Chaos" | "Chaos (AoS)"|"Xenos" | "Order" | "Destruction" | "Death",
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


/* ------------------------------------------------
   Report wrong → call your Next API route
   POST /api/report-wrong-by-link  { link, reason, context? }
--------------------------------------------------*/
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

/* ------------------------------------------------
   Types, labels, & helpers
--------------------------------------------------*/
type GameKind = "warhammer40k" | "ageofsigmar" | "killteam" | "both";

type ProductExtended = Product & {
  image?: string | null;
  game?: GameKind;
};

const GAME_LABEL: Record<GameKind, string> = {
  warhammer40k: "Warhammer 40,000",
  ageofsigmar: "Age of Sigmar",
  killteam: "Kill Team",
  both: "40k • AoS",
};

const GAME_BADGE_CLASS: Record<GameKind, string> = {
  warhammer40k: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ageofsigmar: "bg-amber-100 text-amber-800 border-amber-200",
  killteam: "bg-orange-100 text-orange-800 border-orange-200",
  both: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

type SortKey =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "points-asc"
  | "points-desc";

const bestPriceOrNull = (p: Product) => {
  const nums =
    p.retailers?.map((r) => Number(r?.price)).filter((v) => Number.isFinite(v)) ?? [];
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

/* ------------------------------------------------
   Page
--------------------------------------------------*/
export function ProductLookup() {
  const [queryInput, setQueryInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedGame, setSelectedGame] = useState<string>("all");
  const [selectedFaction, setSelectedFaction] = useState<string>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("featured");

  const featuredIdsRef = useRef<string[] | null>(null);

  const factions = useMemo(
    () => [...new Set(sourceProducts.map((p) => p.faction).filter(Boolean))],
    []
  );
  const categories = useMemo(
    () => [...new Set(sourceProducts.map((p) => p.category).filter(Boolean))],
    []
  );
  
// After you compute `factions`
const factionSet = useMemo(() => new Set(factions), [factions]);

const groupedFactions = useMemo(() => {
  return (Object.entries(FACTION_GROUPS) as [keyof typeof FACTION_GROUPS, string[]][])
    .map(([group, list]) => ({
      group,
      items: list.filter((f) => factionSet.has(f)),
    }))
    .filter((g) => g.items.length > 0);
}, [factionSet]);

  const games = ["warhammer40k", "ageofsigmar"] as const;

  const hasQueryOrFilters =
    searchTerm.trim().length > 0 ||
    selectedGame !== "all" ||
    selectedFaction !== "all" ||
    selectedCategory !== "all" ||
    sortBy !== "featured";

  // 1) filter by search/faction/category/game
  const filteredAll = useMemo(() => {
    return (sourceProducts as ProductExtended[]).filter((p) => {
      const term = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.faction?.toLowerCase?.() ?? "").includes(term);

      const matchesGame = selectedGame === "all" || p.game === selectedGame;
      const matchesFaction = selectedFaction === "all" || p.faction === selectedFaction;
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;

      return matchesSearch && matchesGame && matchesFaction && matchesCategory;
    });
  }, [searchTerm, selectedGame, selectedFaction, selectedCategory]);

  // 2) initial featured (first load only): 5 random with prices
  const initialFeatured = useMemo(() => {
    if (hasQueryOrFilters) return [];
    const withPrices = (sourceProducts as ProductExtended[]).filter(hasAnyPrice);
    const chosen = sample(withPrices, 5);
    featuredIdsRef.current = chosen.map((c) => c.id);
    return chosen;
  }, [hasQueryOrFilters]);

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
        <h1 className="text-3xl font-display font-bold">Price Lookup</h1>
        <p>Compare prices for Wargaming kits across AU retailers, including Warhammer.</p>

        <p className="text-muted-foreground">
          Search for units and compare prices across retailers
        </p>
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
  {/* the text field */}
  <Input
    placeholder="Search units, factions, or keywords..."
    value={queryInput}
    onChange={(e) => setQueryInput(e.target.value)}
    // room for the button on the right
    className="pr-12 bg-white dark:bg-slate-800"
  />

  {/* right-side magnifying-glass button */}
  <button
    type="submit"
    aria-label="Search"
    className="
      absolute right-2 top-1/2 -translate-y-1/2
      p-2 rounded-full
      transition-all duration-150
      hover:bg-slate-100 dark:hover:bg-slate-800/60
      active:scale-95
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
    "
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
            <SelectItem
              value="all"
              className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white transition-all"
            >
              All Games
            </SelectItem>
            {games.map((g) => (
              <SelectItem
                key={g}
                value={g}
                className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white transition-all"
              >
                {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* faction */}
        <Select value={selectedFaction} onValueChange={setSelectedFaction}>
  <SelectTrigger className="w-[220px] bg-white dark:bg-slate-800">
    <SelectValue placeholder="All Factions" />
  </SelectTrigger>

  {/* Use popper so it doesn't stretch, cap height, show scroll */}
  <SelectContent
    position="popper"
    side="bottom"
    align="start"
    className="w-[280px] max-h-[70vh] overflow-y-auto overscroll-contain bg-white dark:bg-slate-800 [scrollbar-gutter:stable] border"
  >
    <SelectItem
      value="all"
      className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white"
    >
      All Factions
    </SelectItem>

    {groupedFactions.map(({ group, items }) => (
      <SelectGroup key={group}>
        <SelectLabel className="px-2 pt-2 text-[11px] uppercase tracking-wide text-slate-500">
          {group}
        </SelectLabel>
        {items.map((f) => (
          <SelectItem
            key={f}
            value={f}
            className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white"
          >
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
            <SelectItem
              value="all"
              className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white transition-all"
            >
              All Categories
            </SelectItem>
            {categories.map((c) => (
              <SelectItem
                key={c}
                value={c}
                className="cursor-pointer px-2 py-1 rounded-sm data-[highlighted]:bg-blue-500 data-[highlighted]:text-white transition-all"
              >
                {c}
              </SelectItem>
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
          <ProductCard key={p.id} product={p as ProductExtended} />
        ))}
        {sorted.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">No products found.</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------
   Card (with zoom modal & top-3 offers)
--------------------------------------------------*/
function ProductCard({ product }: { product: ProductExtended }) {
  const [showAll, setShowAll] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  
  //for linking
  const productUrl = `/product/${product.id}`; 

  const sortedRetailers = [...(product.retailers ?? [])].sort((a, b) => a.price - b.price);
  const best = sortedRetailers[0];
  const highest = sortedRetailers[sortedRetailers.length - 1];
  const visible = showAll ? sortedRetailers : sortedRetailers.slice(0, 3);


  // fix this later
  const thumb = imgSrc(product.image);

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
      onClick={(e) => { e.preventDefault(); setZoomed(true); }} // keep your zoom on click
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
          // prevent infinite loops then swap to logo
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
                  {product.game ? (
                    <Badge variant="outline" className={`ml-2 border ${GAME_BADGE_CLASS[product.game] ?? ""}`}>
                      {GAME_LABEL[product.game] ?? product.game}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2 text-slate-400">
                      Game TBD
                    </Badge>
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
                    {Number.isFinite(r.price) ? fmtAUD(r.price) : "—"}
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

              {/* Hoverable expand/collapse bar */}
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
                src={thumb}
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
