"use client"

import type { FC } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { MagiSystem } from "@/types/llm"

type MagiPanelProps = {
  system: MagiSystem
  content: string
  isStreaming?: boolean
}

const SYSTEM_CONFIG: Record<MagiSystem, { name: string; color: string }> = {
  melchior: {
    name: "MELCHIOR",
    color: "var(--melchior)",
  },
  balthasar: {
    name: "BALTHASAR",
    color: "var(--balthasar)",
  },
  casper: {
    name: "CASPER",
    color: "var(--casper)",
  },
}

export const MagiPanel: FC<MagiPanelProps> = ({
  system,
  content,
  isStreaming = false,
}) => {
  const config = SYSTEM_CONFIG[system]

  return (
    <div className="flex max-h-80 flex-col rounded-lg border border-[var(--border)] bg-[var(--card-bg)] overflow-hidden">
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2 border-b border-[var(--border)]"
        style={{ borderTopColor: config.color, borderTopWidth: "2px" }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: config.color }}
          />
          <span className="font-mono text-sm font-bold">{config.name}</span>
        </div>
        {isStreaming && (
          <span className="text-xs text-gray-400 animate-pulse">
            thinking...
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {content ? (
          <div className="prose prose-sm prose-invert max-w-none text-gray-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Waiting for response...</p>
        )}
      </div>
    </div>
  )
}
