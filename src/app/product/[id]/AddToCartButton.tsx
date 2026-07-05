"use client";

import { useState } from "react";
import { addToCart } from "@/lib/cart";
import { Button } from "@/components/ui/button";

export default function AddToCartButton({ productId }: { productId: string }) {
  const [added, setAdded] = useState(false);
  return (
    <Button
      variant={added ? "secondary" : "default"}
      onClick={() => {
        addToCart(productId);
        setAdded(true);
        setTimeout(() => setAdded(false), 1500);
      }}
    >
      {added ? "Added ✓" : "Add to cart"}
    </Button>
  );
}
