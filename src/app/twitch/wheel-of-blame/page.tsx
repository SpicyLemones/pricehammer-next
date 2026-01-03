import Link from "next/link";

import WheelOfBlameClient from "./wheel-of-blame-client";

export const metadata = {
  title: "Wheel of Blame",
  description: "Spin a roulette with your live chatters.",
};

export default function WheelOfBlamePage() {
  return (
    <div className="w-full max-w-4xl space-y-6">
      <WheelOfBlameClient />
    </div>
  );
}

