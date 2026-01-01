import Link from "next/link";

import { StreamQuestClient } from "./StreamQuestClient";

export const metadata = {
  title: "Stream Quest",
  description: "Daily Twitch dares that shower chat with Toadcoins.",
};

export default function StreamQuestPage() {
  return (
    <div className="relative w-full">
      <video
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-70"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden
        src="/video/dailyquest.mp4"
      />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,0,0,0.55),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(0,0,0,0.65),transparent_40%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-6 pb-12">
        <Link
          href="/twitch"
          className="text-sm font-medium text-amber-100 transition hover:text-amber-200"
        >
          ← Back to Twitch fun
        </Link>

        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-semibold leading-tight text-amber-50 drop-shadow-lg">
            Stream Quest
          </h1>
          <p className="max-w-3xl text-lg text-amber-100/90 drop-shadow">
            Five daily quests over a tavern quest board. Each one pays out 500 Toadcoins to every chatter
            when you click COMPLETE.
          </p>
        </div>

        <StreamQuestClient />
      </div>
    </div>
  );
}
