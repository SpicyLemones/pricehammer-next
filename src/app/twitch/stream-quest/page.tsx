import Link from "next/link";

import { BardToggle } from "./BardToggle";
import { StreamQuestClient } from "./StreamQuestClient";

export const metadata = {
  title: "Stream Quest",
  description: "Daily Twitch dares that shower chat with Toadcoins.",
};

export default function StreamQuestPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <video
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-60 blur-[2px]"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
        src="/videos/dailyquest.mp4"
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.65),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.7),transparent_40%)]" />
      <Link
        href="/twitch"
        className="fixed left-4 top-4 z-50 rounded-full bg-amber-900/80 px-4 py-2 text-sm font-semibold text-amber-50 shadow-lg backdrop-blur transition hover:bg-amber-800/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-50"
      >
        ← Back to spycy.fun/twitch
      </Link>
      <BardToggle />

      <div className="relative z-10 top-5 mx-auto flex w-full max-w-[1920px] flex-col gap-6 px-4 pb-16 pt-20 md:px-6">
        <StreamQuestClient />
      </div>
    </div>
  );
}
