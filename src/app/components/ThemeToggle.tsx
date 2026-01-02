"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    try {
      const stored = window.localStorage.getItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const shouldBeDark = stored ? stored === "dark" : prefersDark;

      root.classList.toggle("dark", shouldBeDark);
      setIsDark(shouldBeDark);
    } catch {
      root.classList.remove("dark");
      setIsDark(false);
    } finally {
      setMounted(true);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const root = document.documentElement;
    root.classList.toggle("dark", isDark);

    try {
      window.localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      // Ignore storage errors (e.g. in private browsing)
    }
  }, [isDark, mounted]);

  const label = mounted
    ? isDark
      ? "Switch to light mode"
      : "Switch to dark mode"
    : "Toggle color mode";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setIsDark(current => !current)}
      aria-label={label}
    >
      {mounted ? (
        isDark ? (
          <Sun className="h-4 w-4" aria-hidden />
        ) : (
          <Moon className="h-4 w-4" aria-hidden />
        )
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
      <span className="ml-2 hidden sm:inline">
        {mounted ? (isDark ? "Light" : "Dark") : "Dark"}
      </span>
    </Button>
  );
}
