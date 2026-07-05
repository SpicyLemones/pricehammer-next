"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cartCount, onCartChange } from "@/lib/cart";

/** Returns the tab CSS for active/inactive state */
function tabClass(isActive: boolean) {
  return [
    "px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
    isActive
      ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-950"
      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60",
  ].join(" ");
}

/** One nav item that highlights when its route matches */
function NavItem({
  href,
  children,
  exact = false,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname() || "/";
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link href={href} className={tabClass(active)}>
      {children}
    </Link>
  );
}

function CartLink() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(cartCount());
    return onCartChange(() => setCount(cartCount()));
  }, []);
  const pathname = usePathname() || "/";
  return (
    <Link
      href="/cart"
      className={`relative inline-flex items-center ${tabClass(pathname.startsWith("/cart"))}`}
      aria-label={`Cart (${count} items)`}
    >
      <ShoppingCart className="h-4 w-4" />
      {count > 0 && (
        <span className="ml-1 text-xs font-semibold tabular-nums">{count}</span>
      )}
    </Link>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="max-w-screen-xl mx-auto grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-3 sm:px-6 sm:py-4 lg:px-8">
        {/* Brand */}
        <Link
          href="/price-lookup"
          className="inline-flex flex-shrink-0 items-center gap-2 font-semibold text-slate-900 transition-colors hover:text-emerald-600 dark:text-white"
        >
          <img
            className="rounded-md dark:hidden"
            src="/logo/logo.png"
            width={50}
            height={50}
            alt="PriceHammer logo"
          />
          <img
            className="hidden rounded-md dark:block"
            src="/logo/logo-dark.svg"
            width={50}
            height={50}
            alt="PriceHammer logo"
          />
          <span className="text-base sm:text-lg">PriceHammer</span>
        </Link>

        {/* Nav, centred in the bar */}
        <nav className="flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar px-2">
          <NavItem href="/" exact>
            Home
          </NavItem>
          <NavItem href="/new-releases">New Releases</NavItem>
          <NavItem href="/about">About</NavItem>
        </nav>

        <div className="flex items-center gap-1">
          <CartLink />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
