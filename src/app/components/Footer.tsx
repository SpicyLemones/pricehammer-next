// src/app/components/Footer.tsx
"use client";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-white/40 backdrop-blur dark:bg-slate-900/80">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-slate-500 space-y-1">
          <p>© {new Date().getFullYear()} PriceHammer</p>
          <p className="max-w-xs text-left">
            Australian Warhammer price comparison tool for Games Workshop miniatures.
          </p>
        </div>

        {/* Middle: nav */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link className="hover:underline" href="/about">About</Link>
          <Link className="hover:underline" href="/contact">Contact</Link>
          {/* 
          <Link className="hover:underline" href="/privacy">Privacy</Link>
          <Link className="hover:underline" href="/terms">Terms</Link> 
           */}
        </nav>

        {/* Right: contact email */}
        <div>
          <a
            className="hover:underline"
            href="mailto:pricehammer25@gmail.com?subject=PriceHammer%20Feedback%20/%20Bug"
          >
            pricehammer25@gmail.com
          </a>
        </div>
      </div>
    </footer>
  );
}
