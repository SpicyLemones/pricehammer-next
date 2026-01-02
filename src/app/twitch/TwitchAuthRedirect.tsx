"use client";

import { useEffect, useState } from "react";

type AuthState =
  | { status: "checking" }
  | { status: "unauthenticated" }
  | { status: "ready"; displayName?: string; live?: boolean }
  | { status: "error" }
  | { status: "misconfigured"; missing?: string[] };

export function TwitchAuthRedirect() {
  const [state, setState] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    async function ensureAuth() {
      try {
        const statusRes = await fetch("/api/twitch/status");
        const status = await statusRes.json();
        if (!statusRes.ok || !status?.configured) {
          setState({ status: "misconfigured", missing: status?.missing ?? [] });
          return;
        }

        const chattersRes = await fetch("/api/twitch/chatters");
        if (chattersRes.status === 401) {
          setState({ status: "unauthenticated" });
          return;
        }

        if (!chattersRes.ok) {
          setState({ status: "error" });
          return;
        }

        const chatters = (await chattersRes.json()) as { live?: boolean; displayName?: string };
        setState({ status: "ready", live: chatters.live, displayName: chatters.displayName });
      } catch (error) {
        console.error("Failed to check Twitch auth", error);
        setState({ status: "error" });
      }
    }

    ensureAuth();
  }, []);

  if (state.status === "checking") {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-700 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200">
        Checking Twitch connection…
      </div>
    );
  }

  if (state.status === "misconfigured") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
        Twitch auth is not configured. {state.missing?.length ? `Missing: ${state.missing.join(", ")}` : ""}
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-100">
        Twitch auth unavailable. Try again shortly.
      </div>
    );
  }

  if (state.status === "unauthenticated") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-900/70 px-5 py-4 text-white shadow-lg ring-1 ring-white/10 backdrop-blur-sm dark:border-slate-800">
        <div className="space-y-1">
          <p className="text-sm font-semibold tracking-wide uppercase">Connect Twitch</p>
          <p className="text-xs text-slate-200/90">
            We&apos;ll ask Twitch for permission to read your chatters (chat:read + moderator:read:chatters).
            We never store your client secret in the browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/twitch/login?redirect=%2Ftwitch"
            className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-purple-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300"
          >
            Connect Twitch
          </a>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full border border-slate-400/70 px-4 py-2 text-sm font-semibold text-white/90 transition hover:border-white/70 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-100">
      {state.live ? "Twitch connected • Stream is live" : "Twitch connected • Stream is offline"}
      {state.displayName ? ` (${state.displayName})` : ""}
    </div>
  );
}
