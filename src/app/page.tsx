// src/app/page.tsx
"use client";
import dynamic from "next/dynamic";

// If ProductLookup is a **named** export:
const ProductLookup = dynamic(
  () => import("@/components/ProductLookup").then(m => m.ProductLookup),
  { ssr: false }
);

// If it's a **default** export, use:
// const ProductLookup = dynamic(() => import("@/components/ProductLookup"), { ssr:false });

export default function HomePage() {
  return <ProductLookup />;
}
