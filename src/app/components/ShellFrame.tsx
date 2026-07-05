// src/app/components/ShellFrame.tsx
"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isHub = pathname === "/";
  // PriceHammer pages share the themed frame with header + footer
  const isPriceHammer = /^\/(price-lookup|about|contact|product|admin|cart|new-releases)/.test(pathname);
  const isTwitchOverlay = pathname.startsWith("/twitch/overlay");

  if (isTwitchOverlay) {
    return (
      <div className="relative min-h-dvh w-full overflow-hidden bg-transparent text-white">
        {children}
      </div>
    );
  }

  if (isHub) {
    return (
      <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  if (isPriceHammer) {
    return (
      <div className="min-h-dvh bg-scroll bg-cover bg-center md:bg-fixed app-bg">
        <div className="min-h-dvh flex flex-col bg-slate-50/95 dark:bg-slate-950/95">
          <Header />
          <main className="flex-1 w-full max-w-screen-xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </main>
          <Footer />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <main className="mx-auto flex   flex-col items-center  ">
        {children}
      </main>
    </div>
  );
}
