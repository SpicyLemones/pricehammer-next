"use client";

// Tiny localStorage cart. Items reference products by id; store choice and
// pricing are resolved against live /api/lookup-data when the cart renders.

export type CartItem = {
  productId: string;
  qty: number;
  /** chosen seller name; undefined = cheapest available */
  store?: string;
};

const KEY = "pricehammer-cart-v1";
const EVENT = "pricehammer-cart-changed";

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is CartItem =>
        i && typeof i.productId === "string" && Number.isFinite(i.qty) && i.qty > 0,
    );
  } catch {
    return [];
  }
}

function write(items: CartItem[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getCart(): CartItem[] {
  return read();
}

export function cartCount(): number {
  return read().reduce((n, i) => n + i.qty, 0);
}

export function addToCart(productId: string, qty = 1): void {
  const items = read();
  const existing = items.find((i) => i.productId === productId);
  if (existing) existing.qty += qty;
  else items.push({ productId, qty });
  write(items);
}

export function setQty(productId: string, qty: number): void {
  let items = read();
  if (qty <= 0) items = items.filter((i) => i.productId !== productId);
  else items = items.map((i) => (i.productId === productId ? { ...i, qty } : i));
  write(items);
}

export function setStore(productId: string, store: string | undefined): void {
  write(read().map((i) => (i.productId === productId ? { ...i, store } : i)));
}

export function removeFromCart(productId: string): void {
  write(read().filter((i) => i.productId !== productId));
}

export function clearCart(): void {
  write([]);
}

/** Subscribe to cart changes (same-tab and cross-tab). Returns unsubscribe. */
export function onCartChange(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
