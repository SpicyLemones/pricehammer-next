"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

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

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="max-w-screen-xl mx-auto flex h-12 items-center gap-3 px-3 sm:h-14 sm:px-6 lg:px-8">        
        {/* Brand */}
        <Link
          href="/price-lookup"
          className="inline-flex flex-shrink-0 items-center gap-2 font-semibold text-slate-900 transition-colors hover:text-emerald-600 dark:text-white"        >
          {/* you can swap to next/image later if you want */}
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

        {/* Nav + actions */}
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-2 px-2">
            <NavItem href="/price-lookup" exact>
              🔎 Product Lookup
            </NavItem>

            <NavItem href="/about">About</NavItem>
            <NavItem href="/contact">Contact</NavItem>

            {/* Region “button”—kept as non-route but styled like the tabs */}
            <button
              type="button"
              className="px-3 py-2 rounded-md text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800/60"
              aria-label="Change region"
              title="Change region (WIP)"
            >
              Change Region: <span className="ml-1 align-middle">🇦🇺 (WIP)</span>
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
