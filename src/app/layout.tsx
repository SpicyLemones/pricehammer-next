// app/layout.tsx
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import { ShellFrame } from "@/components/ShellFrame";
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

const metadataBase = new URL("https://spycy.fun");

const primaryDescription =
  "Spycy.fun is the hub for PriceHammer and future interactive experiments. Explore live tools, track Warhammer prices, and follow along as new playful projects launch.";

export const metadata: Metadata = {
  metadataBase,
  title: {
    default: "Spycy.fun ",
    template: "%s | Spycy.fun",
  },
  description: primaryDescription,
  keywords: [
    "Spycy.fun",
    "PriceHammer",
    "Warhammer prices",
    "Games Workshop deals",
    "Warhammer 40K Australia",
    "Age of Sigmar discounts",
    "miniature wargaming price comparison",
    "indie web experiments",
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
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    title: "Spycy.fun",
    description: primaryDescription,
    siteName: "Spycy.fun",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Spycy.fun ",
    description: primaryDescription,
    creator: "Spycy",
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${serif.variable} ${ui.variable}`}
    >
      <head>
        <Script id="theme-initializer" strategy="beforeInteractive">
          {`
            try {
              const storedTheme = localStorage.getItem('theme');
              const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
              if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (error) {
              document.documentElement.classList.remove('dark');
            }
          `}
        </Script>
        <Script id="ld-json-website" type="application/ld+json" strategy="beforeInteractive">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: "Spycy.fun",
            url: `${metadataBase.origin}/`,
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
        <ShellFrame>{children}</ShellFrame>
      </body>
    </html>
  );
}
