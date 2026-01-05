import type { Metadata } from "next";
import { Suspense } from "react";
import { OverlayClient } from "./OverlayClient";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Twitch Overlay",
  description: "Transparent Twitch overlay with level-up callouts for OBS.",
  robots: { index: false, follow: false },
};

export default function TwitchOverlayPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const streamerIdParam = searchParams.streamerId ?? searchParams.id ?? null;
  const streamerId = Array.isArray(streamerIdParam) ? streamerIdParam[0] : streamerIdParam;

  if (!streamerId) {
    return notFound();
  }

  return (
    <Suspense>
      <OverlayClient streamerId={streamerId} />
    </Suspense>
  );
}
