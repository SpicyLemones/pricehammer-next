"use client";
import Link from "next/link";
import { useRef } from "react";

const tiles = [
  {
    title: "PriceHammer",
    subtitle: "Cheaper warhammer plastic",
    href: "https://pricehammer.xyz",
    external: true,
    background: "/logo.svg", // Background Image
    type: "image"
  },
  { 
    title: "Twitch Toys", 
    subtitle: "Stream shenanigans", 
    href: "/twitch", 
    external: false, 
    background: "/images/twitchtoys.png", // Background Image
    type: "image"
  },
  { 
    title: "RECESSION INDICATOR", 
    subtitle: "IN MAINTENANCE", 
    href: "#", 
    external: false,
    background: "/videos/maintenance.mp4", // Example Video
    type: "video"
  },
  { 
    title: "MY MODS", 
    subtitle: "Hidden for privacy/NDA", 
    href: "#", 
    external: false 
  },
  { 
    title: "Useful Links", 
    subtitle: "Hidden for privacy/NDA", 
    href: "#", 
    external: false 
  },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center gap-10">
      <header className="mt-6 text-center space-y-2">
        <h1 className="text-5xl tracking-wide font-semibold tracking-tight text-slate-900 dark:text-white">Spyce.fun was taken</h1>
        <p className="text-lg text-slate-500 dark:text-slate-300">:(</p>
      </header>

      <section className="w-full max-w-4xl grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tiles.map((tile) => (
          <TileCard key={tile.title} tile={tile} />
        ))}
      </section>

      <footer className="mb-8 text-center text-sm text-slate-500 dark:text-slate-400">
        Made by me, for me, for laughs, giggles, and jolly good wholesome fun.
      </footer>
    </div>
  );
}

function TileCard({ tile }: { tile: any }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const commonClasses =
    "group relative flex flex-col justify-between gap-3 overflow-hidden rounded-md border border-slate-300 bg-white p-5 text-slate-900 transition-colors hover:border-slate-500 active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:border-slate-400";

  const handleMouseEnter = () => {
    if (tile.type === "video" && videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleMouseLeave = () => {
    if (tile.type === "video" && videoRef.current) {
      videoRef.current.pause();
    }
  };

  const Content = (
    <>
      {/* Background Layer */}
      {tile.background && (
        <div className="absolute inset-0 z-0">
          {tile.type === "video" ? (
            <video
              ref={videoRef}
              src={`${tile.background}#t=0.001`}
              muted
              loop
              playsInline
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <img
              src={tile.background}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          )}
          {/* Overlays to keep text readable */}
          <div className="absolute inset-0 bg-white/60 dark:bg-black/40 transition-opacity duration-300 group-hover:opacity-0" />
          <div className="absolute inset-0 bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        </div>
      )}

      {/* Text Content */}
      <div className="relative z-10 space-y-1">
        <h2 className="text-2xl font-bold tracking-wider transition-all duration-300 group-hover:text-white group-hover:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
          {tile.title}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-300 transition-all duration-300 group-hover:text-slate-100 group-hover:drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {tile.subtitle}
        </p>
      </div>

      <span className="relative z-10 text-sm font-medium text-blue-600 dark:text-blue-300 group-hover:text-white transition-colors">
        {tile.external ? "" : " "}
      </span>
    </>
  );

  return tile.external ? (
    <a
      href={tile.href}
      rel="noreferrer"
      target="_blank"
      className={commonClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {Content}
    </a>
  ) : (
    <Link
      href={tile.href}
      className={commonClasses}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {Content}
    </Link>
  );
}