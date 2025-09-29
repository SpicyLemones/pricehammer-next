// src/components/GATracker.tsx
"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { gaPageview } from "@/lib/ga";

export function GATracker() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    gaPageview(pathname + (search?.toString() ? "?" + search.toString() : ""));
  }, [pathname, search]);

  return null;
}
