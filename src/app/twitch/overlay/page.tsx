import type { Metadata } from "next";
import { Suspense } from "react";
import { OverlayClient } from "./OverlayClient";

export const metadata: Metadata = {
  title: "Twitch Overlay",
  description: "Transparent Twitch overlay with level-up callouts for OBS.",
  robots: { index: false, follow: false },
};

export default function TwitchOverlayPage() {
  return (
    <Suspense>
      <OverlayClient />
    </Suspense>
  );
}
