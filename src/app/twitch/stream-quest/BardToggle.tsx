"use client";

import { useRef, useState } from "react";

export function BardToggle() {
  const tavernAudioRef = useRef<HTMLAudioElement | null>(null);
  const [bardSummoned, setBardSummoned] = useState(false);

  const toggleBard = () => {
    const audio = tavernAudioRef.current;
    if (!audio) return;

    const next = !bardSummoned;
    setBardSummoned(next);

    if (next) {
      audio.muted = false;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch((err) => {
          console.warn("Unable to start tavern ambience", err);
          audio.pause();
          audio.muted = true;
          setBardSummoned(false);
        });
      }
    } else {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = true;
    }
  };

  return (
    <>
      <audio
        ref={tavernAudioRef}
        src="/audio/tavern.mp3"
        preload="auto"
        loop
        muted
        aria-hidden
        className="hidden"
      />
      <button
        type="button"
        onClick={toggleBard}
        className="fixed left-4 top-16 z-50 rounded-full bg-rose-700/85 px-4 py-2 text-sm font-semibold text-amber-50 shadow-lg backdrop-blur transition hover:bg-rose-600/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-50"
      >
        {bardSummoned ? "Dismiss the Bard" : "Summon the Bard"}
      </button>
    </>
  );
}
