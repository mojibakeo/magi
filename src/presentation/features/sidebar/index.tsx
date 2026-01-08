"use client"

import type { FC } from "react"
import { useCallback } from "react"
import type { ChatSummary } from "@/types/chat"

type SidebarProps = {
  chats: ChatSummary[]
  currentChatId?: string
  onSelectChat: (chatId: string) => void
  onNewChat: () => void
  onDeleteChat: (chatId: string) => void
}

export const Sidebar: FC<SidebarProps> = ({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
}) => {
  const handleDelete = useCallback(
    (e: React.MouseEvent, chatId: string) => {
      e.stopPropagation()
      onDeleteChat(chatId)
    },
    [onDeleteChat]
  )

  return (
    <aside className="flex h-full w-64 flex-col bg-[var(--sidebar-bg)] border-r border-[var(--border)]">
      <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
        <h1 className="text-lg font-bold text-[var(--primary)]">MAGI</h1>
        <button
          onClick={onNewChat}
          className="rounded-md bg-[var(--primary)] px-3 py-1 text-sm text-white hover:opacity-80 transition-opacity"
        >
          New
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {chats.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No chats yet</p>
        ) : (
          <ul className="space-y-1">
            {chats.map((chat) => (
              <li key={chat.id} className="group">
                <div
                  onClick={() => onSelectChat(chat.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      onSelectChat(chat.id)
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className={`flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    currentChatId === chat.id
                      ? "bg-[var(--card-bg)] text-white"
                      : "text-gray-400 hover:bg-[var(--card-bg)] hover:text-white"
                  }`}
                >
                  <span className="truncate">{chat.title}</span>
                  <button
                    onClick={(e) => handleDelete(e, chat.id)}
                    className="opacity-0 group-hover:opacity-100 ml-2 text-gray-500 hover:text-red-400 transition-opacity"
                    aria-label="Delete chat"
                  >
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </nav>
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex gap-2 text-xs text-gray-500">
          <span className="text-[var(--melchior)]">●</span>
          <span>MELCHIOR</span>
        </div>
        <div className="flex gap-2 text-xs text-gray-500">
          <span className="text-[var(--balthasar)]">●</span>
          <span>BALTHASAR</span>
        </div>
        <div className="flex gap-2 text-xs text-gray-500">
          <span className="text-[var(--casper)]">●</span>
          <span>CASPER</span>
        </div>
      </div>
    </aside>
  )
}
