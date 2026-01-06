"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { Wifi, WifiOff } from "lucide-react";

// --- Configuration ---
const FOCUS_DURATION_MS = 15 * 60 * 1000; // 15 Minutes
const TRANSITION_DELAY_MS = 15 * 1000; // 15 Seconds
const MOCK_CHAT_INTERVAL_MS = 10000; // Just for demo purposes (removable)

type OverlayTarget = {
  id: string;
  name: string;
  level: number;
  xpCurrent: number; // Inferred from xpToNext for demo logic
  xpMax: number;     // Inferred
  color: string;
  flair: string;
};

type ChatMessage = {
  id: string;
  text: string;
};

type ConnectionState = "connecting" | "open" | "closed" | "error";

export function OverlayClient({ streamerId }: { streamerId: string }) {
  // Store all known users from the session
  const [userRegistry, setUserRegistry] = useState<Record<string, OverlayTarget>>({});
  
  // Who is currently being shown on the bar
  const [focusId, setFocusId] = useState<string | null>(null);
  
  // Visual state
  const [isVisible, setIsVisible] = useState(false);
  const [isLevelingUp, setIsLevelingUp] = useState(false);
  const [activeChat, setActiveChat] = useState<ChatMessage | null>(null);
  
  // Connection logic
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- 1. Connection Logic (SSE) ---
  useEffect(() => {
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
          const parsed = JSON.parse(event.data ?? "{}");
          
          if (parsed?.type === "level-up" && parsed.payload) {
            const payload = parsed.payload;
            
            // Normalize data to fit our WoW bar logic
            // Assuming the payload gives us xpToNext. We approximate Max/Current for visual flair
            // if your backend provides current/max, map them directly here.
            const estimatedMax = 500 * (1 + payload.level * 0.1); 
            const estimatedCurrent = Math.max(0, estimatedMax - payload.xpToNext);

            const updatedUser: OverlayTarget = {
              id: payload.id,
              name: payload.name,
              level: payload.level,
              color: payload.color || "from-purple-600 to-indigo-600",
              flair: payload.flair,
              xpCurrent: Math.floor(estimatedCurrent),
              xpMax: Math.floor(estimatedMax),
            };

            setUserRegistry((prev) => ({ ...prev, [payload.id]: updatedUser }));

            // If this update is for the person currently focused, trigger a subtle effect
            if (focusId === payload.id) {
               setIsLevelingUp(true);
               setTimeout(() => setIsLevelingUp(false), 2000); // 2s gold flash
            }
          }
        } catch (error) {
          console.error("Parse error", error);
        }
      };
    };

    connect();

    // Background Cleanup
    const html = document.documentElement;
    const body = document.body;
    html.style.backgroundColor = "transparent";
    body.style.backgroundColor = "transparent";

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [streamerId, focusId]);


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


  // --- 3. Mock Chat Simulation (For Demo Only) ---
  // In reality, you would expose a function here like `handleChat(userId, msg)` 
  // and call it from your chat listener.
  useEffect(() => {
    if (!focusId || !isVisible) return;
    
    const messages = [
      "poggers", "can we get a hype train?", "lvl up soon!", 
      "this looks like wow classic", "kekw", "monkaS", "LFG"
    ];

    const timer = setInterval(() => {
       if (Math.random() > 0.5) {
         setActiveChat({
           id: Date.now().toString(),
           text: messages[Math.floor(Math.random() * messages.length)]
         });
         // Hide bubble after 4s
         setTimeout(() => setActiveChat(null), 4000);
       }
    }, MOCK_CHAT_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [focusId, isVisible]);


  // --- Render Helpers ---
  const activeUser = focusId ? userRegistry[focusId] : null;

  return (
    <div className="relative min-h-screen w-full overflow-hidden font-sans">
      
      {/* Top Left Status */}
      <div className="fixed left-4 top-4 z-50 flex items-center gap-2">
        <div className={`flex items-center gap-2 rounded bg-black/60 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-sm transition-colors ${
          connectionState === "open" ? "border-l-4 border-emerald-500" : "border-l-4 border-red-500"
        }`}>
          {connectionState === "open" ? <Wifi size={14} /> : <WifiOff size={14} />}
          {connectionState === "open" ? "Live" : "Offline"}
        </div>
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