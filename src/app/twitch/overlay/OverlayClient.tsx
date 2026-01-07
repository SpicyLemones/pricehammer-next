"use client";

import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

// --- Configuration ---
const FOCUS_DURATION_MS = 15 * 60 * 1000; // 15 Minutes
const TRANSITION_DELAY_MS = 15 * 1000; // 15 Seconds

type OverlayTarget = {
  id: string;
  name: string;
  level: number;
  xpCurrent: number; // Inferred from xpToNext for demo logic
  xpMax: number;     // Inferred
  color: string;
  flair: string;
  lastMessage?: string;
  lastMessageAt?: number;
};

type ChatMessage = {
  id: string;
  text: string;
};

type LevelUpNotice = {
  id: string;
  name: string;
  level: number;
  flair: string;
  key: string;
  state: "enter" | "leaving";
};

type ConnectionState = "connecting" | "open" | "closed" | "error";

type OverlayEvent =
  | { type: "level-up"; payload: any }
  | { type: "progress"; payload: any }
  | { type: "chat"; payload: any };

export function OverlayClient({ streamerId }: { streamerId: string }) {
  // Store all known users from the session
  const [userRegistry, setUserRegistry] = useState<Record<string, OverlayTarget>>({});
  
  // Who is currently being shown on the bar
  const [focusId, setFocusId] = useState<string | null>(null);
  
  // Visual state
  const [isVisible, setIsVisible] = useState(false);
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const [activeChat, setActiveChat] = useState<ChatMessage | null>(null);
  const [levelNotices, setLevelNotices] = useState<LevelUpNotice[]>([]);
  
  // Connection logic
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Force the document and body to stay transparent for OBS overlays
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    const previousHtmlBg = { color: html.style.backgroundColor, image: html.style.backgroundImage };
    const previousBodyBg = {
      background: body.style.background,
      color: body.style.backgroundColor,
      image: body.style.backgroundImage,
    };
    const hadAppBg = body.classList.contains("app-bg");

    html.style.backgroundColor = "transparent";
    html.style.backgroundImage = "none";
    body.style.background = "transparent";
    body.style.backgroundColor = "transparent";
    body.style.backgroundImage = "none";
    body.classList.remove("app-bg");

    return () => {
      html.style.backgroundColor = previousHtmlBg.color;
      html.style.backgroundImage = previousHtmlBg.image;
      body.style.background = previousBodyBg.background;
      body.style.backgroundColor = previousBodyBg.color;
      body.style.backgroundImage = previousBodyBg.image;
      if (hadAppBg) body.classList.add("app-bg");
    };
  }, []);

  // --- 1. Connection Logic (SSE) ---
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const registerTimer = (cb: () => void, delay: number) => {
      const timer = setTimeout(() => {
        cb();
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
      }, delay);
      timers.push(timer);
      return timer;
    };

    const baseUrl = window.location.origin;
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get("token");
    const secret = searchParams.get("secret");

    if (!token && !secret) {
      setConnectionState("error");
      return;
    }

    const url = new URL(`/api/twitch/overlay/events/${encodeURIComponent(streamerId)}`, baseUrl);
    if (token) url.searchParams.set("token", token);
    if (secret) url.searchParams.set("secret", secret);

    const connect = () => {
      const source = new EventSource(url.toString());
      eventSourceRef.current = source;
      setConnectionState("connecting");

      source.onopen = () => setConnectionState("open");

      source.onerror = () => {
        setConnectionState("error");
        source.close();
        // Simple backoff retry
        reconnectTimerRef.current = setTimeout(connect, 5000);
      };

      source.onmessage = (event) => {
        try {
          const parsed: OverlayEvent = JSON.parse(event.data ?? "{}");
          
          if (parsed?.type === "level-up" && parsed.payload) {
            const payload = parsed.payload;
            
            // Normalize data to fit our WoW bar logic
            // Assuming the payload gives us xpToNext. We approximate Max/Current for visual flair
            // if your backend provides current/max, map them directly here.
            const estimatedMax = 500 * (1 + payload.level * 0.1); 
            const estimatedCurrent = Math.max(0, estimatedMax - payload.xpToNext);
            const messageText = (payload.message ?? "").toString().trim();

            setUserRegistry((prev) => {
              const previous = prev[payload.id];
              const updatedUser: OverlayTarget = {
                id: payload.id,
                name: payload.name,
                level: payload.level,
                color: payload.color || "from-purple-600 to-indigo-600",
                flair: payload.flair,
                xpCurrent: Math.floor(estimatedCurrent),
                xpMax: Math.floor(estimatedMax),
                lastMessage: messageText || previous?.lastMessage,
                lastMessageAt: messageText ? Date.now() : previous?.lastMessageAt,
              };

              return { ...prev, [payload.id]: updatedUser };
            });

            // Immediately feature the chatter that leveled up
            setFocusId(payload.id);
            setIsVisible(true);
            setIsLevelingUp(true);
            registerTimer(() => setIsLevelingUp(false), 2000); // 2s gold flash

            if (messageText) {
              const chatEntry: ChatMessage = { id: `${payload.id}-${Date.now()}`, text: messageText };
              setActiveChat(chatEntry);
              registerTimer(() => {
                setActiveChat((current) => (current?.id === chatEntry.id ? null : current));
              }, 5000);
            }

            const noticeKey = `${payload.id}-${payload.level}-${Date.now()}`;
            const notice: LevelUpNotice = {
              id: payload.id,
              name: payload.name,
              level: payload.level,
              flair: payload.flair ?? "Channel Runner",
              key: noticeKey,
              state: "enter",
            };

            setLevelNotices((prev) => [...prev, notice]);

            registerTimer(() => {
              setLevelNotices((prev) =>
                prev.map((item) => (item.key === noticeKey ? { ...item, state: "leaving" } : item))
              );
            }, 4200);

            registerTimer(() => {
              setLevelNotices((prev) => prev.filter((item) => item.key !== noticeKey));
            }, 4800);
          } else if (parsed?.type === "chat" && parsed.payload) {
            const payload = parsed.payload;
            const messageText = (payload.message ?? "").toString().trim();
            if (!messageText) return;

            setUserRegistry((prev) => {
              const previous = prev[payload.id];
              const updatedUser: OverlayTarget = {
                id: payload.id,
                name: payload.name,
                level: previous?.level ?? 1,
                color: payload.color || previous?.color || "from-purple-600 to-indigo-600",
                flair: payload.flair || previous?.flair || "Channel Runner",
                xpCurrent: previous?.xpCurrent ?? 0,
                xpMax: previous?.xpMax ?? 500,
                lastMessage: messageText,
                lastMessageAt: Date.now(),
              };

              return { ...prev, [payload.id]: updatedUser };
            });
          } else if (parsed?.type === "progress" && parsed.payload) {
            const payload = parsed.payload;
            const level = Number.isFinite(payload.level) ? Number(payload.level) : 1;
            const xpCurrent = Number.isFinite(payload.xpCurrent) ? Number(payload.xpCurrent) : 0;
            const xpMax = Number.isFinite(payload.xpMax) ? Number(payload.xpMax) : 1;

            setUserRegistry((prev) => {
              const previous = prev[payload.id];
              const updatedUser: OverlayTarget = {
                id: payload.id,
                name: payload.name || previous?.name || "Adventurer",
                level: Math.max(1, Math.floor(level)),
                color: payload.color || previous?.color || "from-purple-600 to-indigo-600",
                flair: payload.flair || previous?.flair || "Channel Runner",
                xpCurrent: Math.max(0, Math.round(xpCurrent)),
                xpMax: Math.max(1, Math.round(xpMax)),
                lastMessage: previous?.lastMessage,
                lastMessageAt: previous?.lastMessageAt,
              };

              return { ...prev, [payload.id]: updatedUser };
            });

            // If this is the first user, kick off rotation visibility
            setIsVisible(true);
            if (!focusId) {
              setFocusId(payload.id);
            }
          }
        } catch (error) {
          console.error("Parse error", error);
        }
      };
    };

    connect();

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [streamerId]);


  // --- 2. Focus Rotation Logic ---
  useEffect(() => {
    // Get list of available user IDs
    const userIds = Object.keys(userRegistry);
    if (userIds.length === 0) return;

    // If nobody is focused, start the cycle
    if (!focusId) {
      setFocusId(userIds[0]);
      setIsVisible(true);
      return;
    }

    // Timer to switch user
    const interval = setInterval(() => {
      // 1. Fade out
      setIsVisible(false);

      // 2. Wait, then switch
      setTimeout(() => {
        setFocusId((current) => {
          const userIds = Object.keys(userRegistry);
          const idx = userIds.indexOf(current || "");
          const nextIdx = (idx + 1) % userIds.length;
          return userIds[nextIdx];
        });
        // 3. Fade in
        setIsVisible(true);
      }, TRANSITION_DELAY_MS);

    }, FOCUS_DURATION_MS);

    return () => clearInterval(interval);
  }, [userRegistry, focusId]);


  const activeUser = focusId ? userRegistry[focusId] : null;

  useEffect(() => {
    if (!activeUser?.lastMessage) return;
    const chatEntry: ChatMessage = {
      id: `${activeUser.id}-${activeUser.lastMessageAt ?? Date.now()}`,
      text: activeUser.lastMessage,
    };

    setActiveChat(chatEntry);
    const hideTimer = setTimeout(() => {
      setActiveChat((current) => (current?.id === chatEntry.id ? null : current));
    }, 5200);

    return () => clearTimeout(hideTimer);
  }, [activeUser?.lastMessageAt, activeUser?.id, activeUser?.lastMessage]);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-transparent font-sans text-white">
      
      {/* Top Left Status */}
      <div className="fixed left-4 top-4 z-50 flex items-center gap-2">
        <div className={`flex items-center gap-2 rounded bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors ${
          connectionState === "open" ? "border-l-4 border-emerald-500" : "border-l-4 border-red-500"
        }`}>
          {connectionState === "open" ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connectionState === "open" ? "Live" : "Offline"}
        </div>
      </div>

      {/* Top Right Level-Up Notifications */}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col items-end gap-3">
        {levelNotices.map((notice) => (
          <div
            key={notice.key}
            className={`flex min-w-[220px] max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-800/70 to-black/80 px-4 py-3 shadow-2xl backdrop-blur transition-all duration-500 ${
              notice.state === "leaving" ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"
            }`}
          >
            <div className="h-10 w-1 rounded-full bg-gradient-to-b from-amber-300 via-emerald-300 to-sky-400" />
            <div className="flex flex-col">
              <div className="text-xs uppercase tracking-wide text-amber-200">Level Up</div>
              <div className="text-lg font-bold leading-tight text-white">{notice.name}</div>
              <div className="text-sm text-emerald-200">
                Reached level {notice.level} · {notice.flair}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bottom XP Bar Area */}
      <div className={`fixed bottom-0 left-0 right-0 z-40 transition-all duration-1000 ease-in-out ${
        isVisible && activeUser ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"
      }`}>
        {activeUser && (
          <WoWBar 
            user={activeUser} 
            isLevelingUp={isLevelingUp}
            chatMessage={activeChat}
          />
        )}
      </div>
    </div>
  );
}


function WoWBar({ 
  user, 
  isLevelingUp, 
  chatMessage 
}: { 
  user: OverlayTarget; 
  isLevelingUp: boolean;
  chatMessage: ChatMessage | null;
}) {
  const percentage = Math.min(100, Math.max(0, (user.xpCurrent / user.xpMax) * 100));

  return (
    <div className="relative w-full">
      
      {/* Chat Bubble Container (Pops up from the bar) */}
      <div className="absolute bottom-full left-8 mb-2 w-full pointer-events-none">
        <div className={`flex w-fit max-w-sm flex-col transition-all duration-300 ${
          chatMessage ? "translate-y-0 opacity-100 scale-100" : "translate-y-4 opacity-0 scale-95"
        }`}>
          <div className="relative rounded-xl border border-white/10 bg-black/80 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-md">
            <span className="font-bold text-emerald-400">{user.name}: </span>
            <span className="text-slate-200">{chatMessage?.text}</span>
            {/* Little triangle pointer */}
            <div className="absolute -bottom-1.5 left-4 h-3 w-3 rotate-45 border-b border-r border-white/10 bg-black/80"></div>
          </div>
        </div>
      </div>

      {/* The Bar Itself */}
      <div className="relative h-5 w-full border-t border-black/80 bg-[#0a0a0a]">
        
        {/* Background Grid (The empty slots) */}
        <div className="absolute inset-0 flex">
           {Array.from({ length: 20 }).map((_, i) => (
             <div key={i} className="flex-1 border-r border-white/10 opacity-20" />
           ))}
        </div>

        {/* The Fill Bar */}
        <div 
          className={`h-full transition-all duration-700 ease-out ${
            isLevelingUp ? "bg-amber-300 shadow-[0_0_15px_rgba(252,211,77,0.6)]" : "bg-[#5c1c8a]"
          }`}
          style={{ width: `${percentage}%` }}
        >
          {/* Shine effect on the fill */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
        </div>

        {/* The Segments Overlay (Black lines to chop up the bar) */}
        <div className="absolute inset-0 flex">
           {Array.from({ length: 20 }).map((_, i) => (
             <div key={i} className="flex-1 border-r border-black/60" />
           ))}
        </div>

        {/* Text Overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <p 
            className="font-sans text-[10px] font-bold uppercase tracking-widest text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]"
            style={{ textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }}
          >
            {isLevelingUp ? (
              <span className="text-amber-300 animate-pulse">Level Up!</span>
            ) : (
              <>
                <span className="text-gray-300">{user.name}</span>
                <span className="mx-2 text-gray-500">•</span>
                <span className="text-[#d8b4fe]">XP: {user.xpCurrent} / {user.xpMax}</span>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
