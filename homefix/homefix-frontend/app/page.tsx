"use client";

import { useState, useRef } from "react";
import FormattedMessage from "@/components/FormattedMessage";
import ChatInput from "@/components/ChatInput";
import {
  Wrench,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  RotateCcw,
  Cpu,
  Palette,
  Check,
} from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  safetyWarning?: string | null;
  imagePreview?: string;
  rating?: "up" | "down" | null;
}

const THEMES = {
  industrial: {
    id: "industrial",
    name: "Industrial Amber",
    bg: "bg-zinc-950",
    headerBg: "bg-zinc-900/90",
    accentBg: "bg-amber-500",
    accentHoverBg: "hover:bg-amber-600",
    accentText: "text-amber-500",
    accentBorder: "border-amber-500/40",
    glow: "shadow-[0_0_60px_rgba(245,158,11,0.15)]",
    ambientGlow: "bg-amber-500/10",
    userBubble: "bg-amber-500 text-zinc-950 font-semibold shadow-amber-500/20",
    badge: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    swatch: "bg-amber-500",
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Cyber Cyan",
    bg: "bg-slate-950",
    headerBg: "bg-slate-900/90",
    accentBg: "bg-cyan-500",
    accentHoverBg: "hover:bg-cyan-600",
    accentText: "text-cyan-400",
    accentBorder: "border-cyan-500/40",
    glow: "shadow-[0_0_60px_rgba(6,182,212,0.15)]",
    ambientGlow: "bg-cyan-500/10",
    userBubble: "bg-cyan-500 text-slate-950 font-semibold shadow-cyan-500/20",
    badge: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40",
    swatch: "bg-cyan-500",
  },
  emerald: {
    id: "emerald",
    name: "Clean Emerald",
    bg: "bg-stone-950",
    headerBg: "bg-stone-900/90",
    accentBg: "bg-emerald-600",
    accentHoverBg: "hover:bg-emerald-700",
    accentText: "text-emerald-400",
    accentBorder: "border-emerald-600/40",
    glow: "shadow-[0_0_60px_rgba(5,150,105,0.15)]",
    ambientGlow: "bg-emerald-600/10",
    userBubble: "bg-emerald-600 text-white shadow-emerald-600/20",
    badge: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40",
    swatch: "bg-emerald-600",
  },
  violet: {
    id: "violet",
    name: "Royal Violet",
    bg: "bg-neutral-950",
    headerBg: "bg-neutral-900/90",
    accentBg: "bg-violet-600",
    accentHoverBg: "hover:bg-violet-700",
    accentText: "text-violet-400",
    accentBorder: "border-violet-600/40",
    glow: "shadow-[0_0_60px_rgba(124,58,237,0.15)]",
    ambientGlow: "bg-violet-600/10",
    userBubble: "bg-violet-600 text-white shadow-violet-600/20",
    badge: "bg-violet-600/20 text-violet-400 border-violet-600/40",
    swatch: "bg-violet-600",
  },
  obsidian: {
    id: "obsidian",
    name: "Obsidian Red",
    bg: "bg-black",
    headerBg: "bg-neutral-950/90",
    accentBg: "bg-red-600",
    accentHoverBg: "hover:bg-red-700",
    accentText: "text-red-500",
    accentBorder: "border-red-600/40",
    glow: "shadow-[0_0_60px_rgba(229,9,20,0.15)]",
    ambientGlow: "bg-red-600/10",
    userBubble: "bg-red-600 text-white shadow-red-600/20",
    badge: "bg-red-600/20 text-red-400 border-red-600/40",
    swatch: "bg-red-600",
  },
};

type ThemeKey = keyof typeof THEMES;

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const CATEGORIES = ["All", "Laundry", "Refrigeration", "Dishwashing", "Cooking"];

const TRENDING_DIAGNOSES = [
  { rank: "1", label: "Washing Machine Spinning Noise & Vibration", category: "Laundry" },
  { rank: "2", label: "Refrigerator Freezing Up or Not Cooling", category: "Refrigeration" },
  { rank: "3", label: "Dishwasher Standing Water & Drain Faults", category: "Dishwashing" },
  { rank: "4", label: "Oven Temperature Sensor & Heating Failure", category: "Cooking" },
];

export default function Home() {
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>("industrial");
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "**Welcome to HomeFix Copilot.**\n\nYour autonomous repair assistant is online. Upload a photo of your appliance model sticker, enter an error code, or record a voice query to begin technical diagnostics.",
      rating: null,
    },
  ]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const theme = THEMES[currentTheme];

  const [sessionId] = useState(
    () => `session_${Math.random().toString(36).substring(7)}`
  );

  const handleStopRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleClearStream = () => {
    setMessages([
      {
        role: "assistant",
        content: "Session reset. What appliance problem are we diagnosing next?",
        rating: null,
      },
    ]);
  };

  const handleRating = (index: number, type: "up" | "down") => {
    setMessages((prev) =>
      prev.map((msg, i) =>
        i === index ? { ...msg, rating: msg.rating === type ? null : type } : msg
      )
    );
  };

  const handleSendMessage = async (text: string, imageFile: File | null) => {
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let imagePreview: string | undefined = undefined;
    let finalQueryText = text;

    if (imageFile) {
      imagePreview = URL.createObjectURL(imageFile);
    }

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: text || "Uploaded image frame for analysis.",
        imagePreview,
      },
    ]);

    try {
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);

        const imgRes = await fetch(`${API_URL}/api/analyze-image`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const extractedText = imgData.analysis || imgData.extracted_text;
          finalQueryText = text
            ? `${text}\n\n[Visual Analysis Context]: ${extractedText}`
            : `Extracted from image analysis: ${extractedText}`;
        }
      }

      const chatRes = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalQueryText, session_id: sessionId }),
        signal: controller.signal,
      });

      if (!chatRes.ok) throw new Error("Backend connection failed");
      const chatData = await chatRes.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: chatData.response,
          safetyWarning: chatData.safety_warning,
          rating: null,
        },
      ]);
    } catch (error: any) {
      if (error.name === "AbortError") {
        console.log("Request stopped by user.");
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "⚠️ **Connection Interrupted:** Unable to reach HomeFix backend server. Check backend host status.",
            rating: null,
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const filteredTrending =
    selectedCategory === "All"
      ? TRENDING_DIAGNOSES
      : TRENDING_DIAGNOSES.filter((item) => item.category === selectedCategory);

  return (
    <main className={`flex flex-col h-screen ${theme.bg} text-neutral-100 max-w-5xl mx-auto border-x border-neutral-900 ${theme.glow} font-sans relative overflow-hidden transition-colors duration-300`}>
      {/* Background Ambient Glow */}
      <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-36 ${theme.ambientGlow} blur-[120px] pointer-events-none rounded-full transition-colors duration-300`} />

      {/* Header */}
      <header className={`px-6 py-4 ${theme.headerBg} backdrop-blur-md border-b border-neutral-900 flex items-center justify-between sticky top-0 z-20`}>
        <div className="flex items-center gap-3">
          <div className={`p-2.5 ${theme.accentBg} rounded-xl text-black shadow-lg transition-colors duration-300`}>
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-extrabold text-lg tracking-wider text-white uppercase">
                HOMEFIX <span className={`${theme.accentText} transition-colors duration-300`}>COPILOT</span>
              </h1>
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border rounded ${theme.badge} transition-colors duration-300`}>
                v2.0 RAG
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-medium">
              Autonomous Appliance Technical Diagnostics & Manual Retrieval
            </p>
          </div>
        </div>

        {/* Action Controls & Theme Selector */}
        <div className="flex items-center gap-2 sm:gap-3 relative">
          <div className="relative">
            <button
              onClick={() => setIsPaletteOpen(!isPaletteOpen)}
              className="p-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 border border-neutral-800 rounded-lg transition-all flex items-center gap-1.5 text-xs font-semibold"
              title="Change Color Palette"
            >
              <Palette className="w-4 h-4 text-neutral-400" />
              <span className="hidden md:inline">Theme</span>
            </button>

            {isPaletteOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl p-2 z-30 space-y-1">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 px-2 py-1">
                  Color Themes
                </div>
                {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
                  const t = THEMES[key];
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setCurrentTheme(key);
                        setIsPaletteOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors ${
                        currentTheme === key
                          ? "bg-neutral-800 text-white font-bold"
                          : "text-neutral-400 hover:text-white hover:bg-neutral-800/50"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${t.swatch}`} />
                        <span>{t.name}</span>
                      </div>
                      {currentTheme === key && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={handleClearStream}
            className="p-2 bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white border border-neutral-800 rounded-lg transition-all"
            title="Reset Diagnostic Session"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full text-xs font-mono text-neutral-300">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${theme.accentBg} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${theme.accentBg}`}></span>
            </span>
            <span className="hidden sm:inline uppercase text-[10px] tracking-wider font-bold text-neutral-400">
              SYSTEM ACTIVE
            </span>
          </div>
        </div>
      </header>

      {/* Main Diagnostic Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scrollbar-thin scrollbar-thumb-neutral-800">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${
              msg.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-xl p-4 sm:p-5 transition-all ${
                msg.role === "user"
                  ? `${theme.userBubble} shadow-lg`
                  : "bg-neutral-900/90 border border-neutral-800/90 text-neutral-200 rounded-bl-none shadow-md"
              }`}
            >
              {msg.imagePreview && (
                <div className="relative mb-3 overflow-hidden rounded-lg border border-neutral-700">
                  <img
                    src={msg.imagePreview}
                    alt="Uploaded frame preview"
                    className="max-h-60 w-full object-cover"
                  />
                  <div className={`absolute top-2 left-2 bg-black/80 backdrop-blur-sm text-[10px] font-bold ${theme.accentText} uppercase px-2 py-0.5 rounded border ${theme.accentBorder}`}>
                    VISUAL ANALYSIS
                  </div>
                </div>
              )}
              {msg.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              ) : (
                <FormattedMessage
                  content={msg.content}
                  safetyWarning={msg.safetyWarning}
                />
              )}
            </div>

            {msg.role === "assistant" && (
              <div className="flex items-center gap-2 mt-1.5 px-2 text-neutral-500 text-xs">
                <span>Was this diagnosis accurate?</span>
                <button
                  onClick={() => handleRating(idx, "up")}
                  className={`p-1 hover:text-white transition-colors ${
                    msg.rating === "up" ? "text-emerald-400" : ""
                  }`}
                  title="Thumbs Up"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleRating(idx, "down")}
                  className={`p-1 hover:text-white transition-colors ${
                    msg.rating === "down" ? "text-red-500" : ""
                  }`}
                  title="Thumbs Down"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Interactive Category Selector & Input Area */}
      <div className="p-4 border-t border-neutral-900 bg-neutral-950/95 backdrop-blur-lg space-y-3">
        {messages.length <= 2 && !isLoading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <span className="text-[11px] font-bold uppercase text-neutral-500 flex items-center gap-1 shrink-0 mr-1">
                <Cpu className={`w-3.5 h-3.5 ${theme.accentText}`} /> Category:
              </span>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold transition-all shrink-0 ${
                    selectedCategory === cat
                      ? `${theme.accentBg} text-white shadow-md`
                      : "bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {filteredTrending.map((item) => (
                <button
                  key={item.rank}
                  onClick={() => handleSendMessage(item.label, null)}
                  className="flex items-center gap-2 shrink-0 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-800 hover:border-neutral-700 px-3 py-2 rounded-lg transition-all text-xs group"
                >
                  <span className={`font-black ${theme.accentText} text-sm italic group-hover:scale-110 transition-transform`}>
                    #{item.rank}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <button
            type="button"
            onClick={handleStopRequest}
            className={`px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider ${theme.badge} rounded-lg transition-all flex items-center gap-2 w-fit`}
          >
            <ShieldAlert className="w-4 h-4" /> Stop Generation
          </button>
        )}

        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </main>
  );
}
