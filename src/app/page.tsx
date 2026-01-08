"use client"

import { Sidebar } from "@/presentation/features/sidebar"
import { Chat } from "@/presentation/features/chat"
import { useChat } from "@/hooks/useChat"

const HomePage = () => {
  const {
    chats,
    currentChat,
    streamingState,
    selectChat,
    createChat,
    deleteChat,
    sendMessage,
  } = useChat()

  return (
    <div className="flex h-screen">
      <Sidebar
        chats={chats}
        currentChatId={currentChat?.id}
        onSelectChat={selectChat}
        onNewChat={createChat}
        onDeleteChat={deleteChat}
      />
      <main className="flex-1">
        <Chat
          messages={currentChat?.messages ?? []}
          streamingState={streamingState}
          onSendMessage={sendMessage}
        />
      </main>
    </div>
  )
}

export default HomePage
