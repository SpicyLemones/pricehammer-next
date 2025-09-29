// src/app/components/Footer.tsx
"use client";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t">
      <div className="max-w-screen-xl mx-auto px-3 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-sm text-slate-500">
          © {new Date().getFullYear()} PriceHammer
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
