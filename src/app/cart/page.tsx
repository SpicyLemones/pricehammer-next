import type { Metadata } from "next";
import { CartClient } from "./CartClient";

export const metadata: Metadata = {
  title: "Cart",
  description: "Plan a Warhammer order: pick a store per kit and estimate the total including delivery.",
  alternates: { canonical: "/cart" },
};

export default function CartPage() {
  return <CartClient />;
}
