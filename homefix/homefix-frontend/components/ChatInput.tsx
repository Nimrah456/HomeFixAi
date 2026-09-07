"use client";

import { useState, useRef } from "react";
import { Mic, MicOff, Image as ImageIcon, Send, Loader2, X } from "lucide-react";

interface ChatInputProps {
  onSendMessage: (text: string, imageFile: File | null) => void;
  isLoading: boolean;
}

export default function ChatInput({ onSendMessage, isLoading }: ChatInputProps) {
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/m4a" });
        await handleAudioUpload(audioBlob);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      alert("Microphone permission denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioUpload = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "recording.m4a");

      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/transcribe-audio`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Audio transcription failed");
      const data = await res.json();
      setText((prev) => (prev ? `${prev} ${data.text}` : data.text));
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!text.trim() && !imageFile) || isLoading) return;
    onSendMessage(text, imageFile);
    setText("");
    setImageFile(null);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-slate-900 border-t border-slate-800 space-y-3">
      {imageFile && (
        <div className="flex items-center gap-2 bg-slate-800 text-xs text-slate-300 px-3 py-1.5 rounded-md w-fit">
          <ImageIcon className="w-4 h-4 text-blue-400" />
          <span className="truncate max-w-[200px]">{imageFile.name}</span>
          <button type="button" onClick={() => setImageFile(null)} className="hover:text-red-400">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && setImageFile(e.target.files[0])}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          title="Upload model sticker or display picture"
        >
          <ImageIcon className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isTranscribing}
          className={`p-2.5 rounded-lg transition ${
            isRecording ? "bg-red-600 text-white animate-pulse" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
          title={isRecording ? "Stop recording" : "Record voice query"}
        >
          {isTranscribing ? <Loader2 className="w-5 h-5 animate-spin" /> : isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={isRecording ? "Recording audio..." : "Describe the problem, model, or error code..."}
          className="flex-1 bg-slate-800 text-slate-100 placeholder-slate-500 text-sm rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          type="submit"
          disabled={isLoading || (!text?.trim() && !imageFile)}
          className="p-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition"
        >
          {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </form>
  );
}