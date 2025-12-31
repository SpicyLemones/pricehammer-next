// src/app/components/ShellFrame.tsx
"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const isHub = pathname === "/";
  const isPriceLookup = pathname.startsWith("/price-lookup");

  if (isHub) {
    return (
      <div className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
        <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center px-4 py-12 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

  if (isPriceLookup) {
    return (
      <div className="min-h-dvh bg-scroll bg-cover bg-center md:bg-fixed app-bg">
        <div className="min-h-dvh flex flex-col bg-white/60 dark:bg-black/70 backdrop-blur-sm">
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
      <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col items-center px-4 py-12 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
