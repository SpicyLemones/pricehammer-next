import Link from "next/link";

import WheelOfBlameClient from "./wheel-of-blame-client";

export const metadata = {
  title: "Wheel of Blame",
  description: "Spin a roulette with your live chatters.",
};

export default function WheelOfBlamePage() {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <Link
        href="/twitch"
        className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200"
      >
        ← Back to Twitch fun
      </Link>
      <WheelOfBlameClient />
    </div>
  );
}

