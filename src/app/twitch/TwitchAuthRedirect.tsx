"use client";

import { useEffect, useState } from "react";

type AuthState = "checking" | "ready" | "redirecting" | "error" | "misconfigured";

export function TwitchAuthRedirect() {
  const [state, setState] = useState<AuthState>("checking");

  useEffect(() => {
    async function ensureAuth() {
      try {
        const status = await fetch("/api/twitch/status").then((res) => res.json());
        if (!status?.configured) {
          setState("misconfigured");
          return;
        }

        const chattersRes = await fetch("/api/twitch/chatters");
        if (chattersRes.status === 401) {
          setState("redirecting");
          window.location.href = "/api/twitch/login";
          return;
        }

        setState("ready");
      } catch (error) {
        console.error("Failed to check Twitch auth", error);
        setState("error");
      }
    }

    ensureAuth();
  }, []);

  if (state === "redirecting") {
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 shadow-sm">
        Redirecting to Twitch to authorize…
      </div>
    );
  }

  if (state === "error" || state === "misconfigured") {
    return (
      <div className="rounded-lg border border-rose-300/60 bg-rose-50/80 px-3 py-2 text-sm text-rose-900 shadow-sm">
        Twitch auth unavailable. Check configuration.
      </div>
    );
  }

  return null;
}
