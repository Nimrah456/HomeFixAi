"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertTriangle } from "lucide-react";

interface FormattedMessageProps {
  content: string;
  safetyWarning?: string | null;
}

export default function FormattedMessage({ content, safetyWarning }: FormattedMessageProps) {
  return (
    <div className="space-y-3">
      {safetyWarning && (
        <div className="flex items-start gap-3 bg-red-950/80 border border-red-500/50 text-red-200 p-3.5 rounded-lg text-sm font-semibold shadow-md">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <span className="block text-red-400 uppercase text-xs tracking-wider mb-0.5">Safety Mandate Active</span>
            {safetyWarning}
          </div>
        </div>
      )}
      <div className="prose prose-invert prose-slate max-w-none text-sm leading-relaxed">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </div>
  );
}