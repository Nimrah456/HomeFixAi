"use client";

import { useState, useRef } from "react";
import FormattedMessage from "@/components/FormattedMessage";
import ChatInput from "@/components/ChatInput";
import { Wrench } from "lucide-react";

interface Message {
  role: "user" | "assistant";
  content: string;
  safetyWarning?: string | null;
  imagePreview?: string;
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I am HomeFix Copilot. Ask me troubleshooting questions, record a voice query, or upload a picture of an error screen or model sticker.",
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopRequest = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const [sessionId] = useState(
    () => `session_${Math.random().toString(36).substring(7)}`
  );

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const handleSendMessage = async (text: string, imageFile: File | null) => {
    setIsLoading(true);

    // Initialize AbortController for request cancellation
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
        content: text || "Uploaded image for analysis.",
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
          signal: controller.signal, // Pass cancellation signal
        });

        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const extractedText = imgData.analysis || imgData.extracted_text;
          finalQueryText = text
            ? `${text}\n\n[Image Context]: ${extractedText}`
            : `Extracted from image: ${extractedText}`;
        }
      }

      const chatRes = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: finalQueryText, session_id: sessionId }),
        signal: controller.signal, // Pass cancellation signal
      });

      if (!chatRes.ok) throw new Error("Backend connection failed");
      const chatData = await chatRes.json();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: chatData.response,
          safetyWarning: chatData.safety_warning,
        },
      ]);
    } catch (error: any) {
      // Gracefully handle manual cancellations
      if (error.name === "AbortError") {
        console.log("Request cancelled by user.");
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "An error occurred while connecting to the HomeFix backend server.",
          },
        ]);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <main className="flex flex-col h-screen bg-slate-950 text-slate-100 max-w-4xl mx-auto border-x border-slate-800 shadow-2xl">
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex items-center gap-3">
        <div className="p-2 bg-blue-600 rounded-lg">
          <Wrench className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-base text-slate-100">HomeFix Copilot</h1>
          <p className="text-xs text-slate-400">
            Autonomous Appliance Diagnostics & Repair Assistant
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-2xl p-4 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-none"
                  : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-none"
              }`}
            >
              {msg.imagePreview && (
                <img
                  src={msg.imagePreview}
                  alt="Uploaded preview"
                  className="max-h-48 rounded-lg mb-3 object-cover border border-slate-700"
                />
              )}
              {msg.role === "user" ? (
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <FormattedMessage
                  content={msg.content}
                  safetyWarning={msg.safetyWarning}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input section with Stop Generation Button */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        {isLoading && (
          <button
            type="button"
            onClick={handleStopRequest}
            className="mb-3 px-3 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5"
          >
            <span>🛑</span> Stop Generation
          </button>
        )}
        <ChatInput onSendMessage={handleSendMessage} isLoading={isLoading} />
      </div>
    </main>
  );
}