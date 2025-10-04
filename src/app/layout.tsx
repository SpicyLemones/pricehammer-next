// app/layout.tsx
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Bebas_Neue, Merriweather, Montserrat } from "next/font/google";

const display = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
});

const serif = Merriweather({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-serif",
});

const ui = Montserrat({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-ui",
});

const metadataBase = new URL("https://pricehammer.xyz");

const primaryDescription =
  "Compare Australian Warhammer 40,000 and Age of Sigmar prices with PriceHammer. We track local stock, highlight savings, and help you stay ahead of Games Workshop price rises across trusted Australian hobby stores.";

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Warhammer Price Tracker for Australia",
    template: "%s | PriceHammer",
  },
  description: primaryDescription,
  keywords: [
    "Warhammer prices",
    "Games Workshop deals",
    "Warhammer 40K Australia",
    "Age of Sigmar discounts",
    "miniature wargaming price comparison",
  ],
  authors: [{ name: "PriceHammer" }],
  creator: "PriceHammer",
  publisher: "PriceHammer",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  manifest: "/site.webmanifest",
  alternates: {
    canonical: "/price-lookup",
  },
  openGraph: {
    type: "website",
    url: "/price-lookup",
    title: "Warhammer Price Tracker for Australia | PriceHammer",
    description: primaryDescription,
    siteName: "PriceHammer",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Warhammer Price Tracker for Australia | PriceHammer",
    description: primaryDescription,
    creator: "@pricehammer",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  category: "shopping",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${serif.variable} ${ui.variable}`}>
      <head>
        <Script id="ld-json-website" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "PriceHammer",
            url: `${metadataBase.origin}/price-lookup`,
            description: primaryDescription,
            inLanguage: "en-AU",
            potentialAction: {
              "@type": "SearchAction",
              target: {
                "@type": "EntryPoint",
                urlTemplate: `${metadataBase.origin}/price-lookup?search={search_term_string}`,
              },
              "query-input": "required name=search_term_string",
            },
          })}
        </Script>
      </head>
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
