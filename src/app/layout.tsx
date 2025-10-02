// app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { EB_Garamond, Inter } from "next/font/google";

const display = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
});
const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Pricehammer",
  description: "Get the best Warhammer prices in Australia.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/site.webmanifest",
  // ❌ themeColor must not be here
};

// ✅ move themeColor into a separate viewport export
export const viewport: Viewport = {
  // single color:
  // themeColor: "#0ea5e9",

  // or media-aware colors:
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)",  color: "#0b1220" },
  ],
  // (optional) other viewport bits if you want:
  // width: "device-width",
  // initialScale: 1,
  // colorScheme: "light dark",
  // viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh bg-scroll md:bg-fixed bg-cover bg-center app-bg">
        <div className="min-h-dvh flex flex-col bg-white/60 dark:bg-black/70 backdrop-blur-sm">
          <Header />
          <main className="flex-1 w-full max-w-screen-xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
