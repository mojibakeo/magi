"use client"

import type { FC } from "react"
import { useCallback, useState } from "react"
import type { FileAttachment } from "@/types/llm"
import { FileUpload } from "../FileUpload"

type ChatInputProps = {
  onSubmit: (message: string, files: FileAttachment[]) => void
  disabled?: boolean
}

export const ChatInput: FC<ChatInputProps> = ({
  onSubmit,
  disabled = false,
}) => {
  const [message, setMessage] = useState("")
  const [files, setFiles] = useState<FileAttachment[]>([])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!message.trim() && files.length === 0) return

      onSubmit(message, files)
      setMessage("")
      setFiles([])
    },
    [message, files, onSubmit]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault()
        handleSubmit(e)
      }
    },
    [handleSubmit]
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 border-t border-[var(--border)] bg-[var(--sidebar-bg)] p-4"
    >
      <FileUpload files={files} onFilesChange={setFiles} disabled={disabled} />
      <div className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the MAGI system..."
          disabled={disabled}
          rows={2}
          className="flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--card-bg)] px-4 py-2 text-sm placeholder-gray-500 focus:border-[var(--primary)] focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || (!message.trim() && files.length === 0)}
          className="rounded-lg bg-[var(--primary)] px-6 py-2 font-medium text-white hover:opacity-80 disabled:opacity-50 transition-opacity"
        >
          Send
        </button>
      </div>
      <p className="text-xs text-gray-500">
        Press Enter to send, Shift+Enter for new line
      </p>
    </form>
  )
}
