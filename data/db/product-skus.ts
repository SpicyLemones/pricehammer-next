export type ProductSkuCatalogueEntry = {
  /** Internal Pricehammer product ID */
  productId: string;
  /** Manufacturer (Games Workshop) SKU when known */
  canonicalSku: string | null;
  /** Additional SKUs or retailer-specific aliases that map back to the product */
  skuAliases?: string[];
  /** Optional alternate names (e.g. "Start Collecting! Stormcast Eternals") */
  nameAliases?: string[];
};

/**
 * Canonical SKU catalogue linking the Pricehammer product database back to
 * Games Workshop identifiers. Extend this list as you confirm new products.
 */
export const ProductSkuCatalogue: ProductSkuCatalogueEntry[] = [
  {
    productId: "870",
    canonicalSku: "99120218061",
    skuAliases: ["prod4780167-99120218061"],
    nameAliases: ["Stormcast Eternals Vindictors"],
  },
];
