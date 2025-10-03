import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Warhammer Price Comparison Tool",
  description:
    "Compare Games Workshop prices from hobby stores with PriceHammer so you can spot stock and savings before checking out.",
  alternates: {
    canonical: "/",
  },
};

export default function LegacyWarhammerPricesPage() {
  redirect("/");
}
