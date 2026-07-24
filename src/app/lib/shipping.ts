// Delivery estimates from the sellers.shipping_info JSON column:
// { tag, deal, flat, freeOver, note } — researched per store, stored once.

export type ShippingInfo = {
  tag?: string | null;
  deal?: string | null;
  flat?: number | null;
  freeOver?: number | null;
  note?: string | null;
};

export function parseShipping(json: string | null | undefined): ShippingInfo | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as ShippingInfo) : null;
  } catch {
    return null;
  }
}

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

// One line for a given order price: what delivery is likely to cost.
export function deliveryEstimate(info: ShippingInfo | null, price: number | null | undefined): string {
  const p = Number(price);
  if (!info) return "Delivery calculated at checkout";
  if (info.freeOver != null && Number.isFinite(p) && p >= info.freeOver) {
    return `Free delivery (orders over ${money(info.freeOver)})`;
  }
  if (info.flat != null) {
    return info.freeOver != null
      ? `+${money(info.flat)} delivery (free over ${money(info.freeOver)})`
      : `+${money(info.flat)} delivery`;
  }
  if (info.freeOver != null) {
    return `Delivery at checkout (free over ${money(info.freeOver)})`;
  }
  if (info.note) {
    const n = info.note.trim();
    return n.charAt(0).toUpperCase() + n.slice(1);
  }
  return "Delivery calculated at checkout";
}
