"use client"

import { useState, useCallback, useEffect } from "react"
import type {
  ChatSummary,
  ChatData,
  MessageData,
  StreamingState,
} from "@/types/chat"
import type { FileAttachment } from "@/types/llm"
import type { DeliberationEvent } from "@/infrastructures/llm/deliberation"

const initialStreamingState: StreamingState = {
  isStreaming: false,
  currentRound: 0,
  responses: {
    melchior: "",
    balthasar: "",
    casper: "",
  },
  rounds: [],
  currentConclusion: undefined,
  finalVotes: undefined,
}

export const useChat = () => {
  const [chats, setChats] = useState<ChatSummary[]>([])
  const [currentChat, setCurrentChat] = useState<ChatData | undefined>()
  const [streamingState, setStreamingState] =
    useState<StreamingState>(initialStreamingState)

  const fetchChats = useCallback(async () => {
    const response = await fetch("/api/chat")
    const data = (await response.json()) as ChatSummary[]
    setChats(data)
  }, [])

  const fetchChat = useCallback(async (chatId: string) => {
    const response = await fetch(`/api/chat/${chatId}`)
    const data = (await response.json()) as ChatData
    setCurrentChat(data)
  }, [])

  const createChat = useCallback(async () => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Chat" }),
    })
    const data = (await response.json()) as ChatSummary
    await fetchChats()
    await fetchChat(data.id)
    return data.id
  }, [fetchChats, fetchChat])

  const deleteChat = useCallback(
    async (chatId: string) => {
      await fetch(`/api/chat/${chatId}`, { method: "DELETE" })
      await fetchChats()
      if (currentChat?.id === chatId) {
        setCurrentChat(undefined)
      }
    },
    [currentChat, fetchChats]
  )

  const selectChat = useCallback(
    async (chatId: string) => {
      await fetchChat(chatId)
    },
    [fetchChat]
  )

  const sendMessage = useCallback(
    async (message: string, files: FileAttachment[]) => {
      let chatId = currentChat?.id
      if (!chatId) {
        chatId = await createChat()
      }

      const userMessage: MessageData = {
        id: `temp-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
        files: files.map((f, i) => ({
          id: `temp-file-${i}`,
          name: f.name,
          mimeType: f.mimeType,
          path: "",
        })),
        rounds: [],
      }

      setCurrentChat((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, userMessage] }
          : undefined
      )

      setStreamingState({
        isStreaming: true,
        currentRound: 1,
        responses: { melchior: "", balthasar: "", casper: "" },
        rounds: [],
        currentConclusion: undefined,
        finalVotes: undefined,
      })

      try {
        const response = await fetch("/api/deliberate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message, files }),
        })

        const reader = response.body?.getReader()
        if (!reader) throw new Error("No response body")

        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const eventData = line.slice(6)

            try {
              const event = JSON.parse(eventData) as DeliberationEvent

              switch (event.type) {
                case "round_start":
                  setStreamingState((prev) => ({
                    ...prev,
                    currentRound: event.round,
                    responses: { melchior: "", balthasar: "", casper: "" },
                    currentConclusion: undefined,
                  }))
                  break

                case "stream":
                  setStreamingState((prev) => ({
                    ...prev,
                    responses: {
                      ...prev.responses,
                      [event.system]: prev.responses[event.system] + event.content,
                    },
                  }))
                  break

                case "round_complete":
                  setStreamingState((prev) => ({
                    ...prev,
                    rounds: [
                      ...prev.rounds,
                      {
                        id: `round-${event.round.number}`,
                        number: event.round.number,
                        melchior:
                          event.round.responses.find((r) => r.system === "melchior")
                            ?.content ?? "",
                        balthasar:
                          event.round.responses.find((r) => r.system === "balthasar")
                            ?.content ?? "",
                        casper:
                          event.round.responses.find((r) => r.system === "casper")
                            ?.content ?? "",
                        consensus: event.round.consensus,
                      },
                    ],
                  }))
                  break

                case "conclusion_generated":
                  setStreamingState((prev) => ({
                    ...prev,
                    currentConclusion: event.conclusion,
                  }))
                  break

                case "voting_complete":
                  setStreamingState((prev) => {
                    const updatedRounds = [...prev.rounds]
                    const lastRound = updatedRounds[updatedRounds.length - 1]
                    if (lastRound) {
                      lastRound.votes = event.votes
                      lastRound.conclusion = prev.currentConclusion
                    }
                    return {
                      ...prev,
                      rounds: updatedRounds,
                    }
                  })
                  break

                case "consensus_reached":
                case "max_rounds_reached":
                  setStreamingState((prev) => ({
                    ...prev,
                    isStreaming: false,
                    currentConclusion: event.conclusion,
                    finalVotes: event.votes,
                  }))
                  await fetchChat(chatId)
                  await fetchChats()
                  break
              }
            } catch {
              // Ignore JSON parse errors for incomplete chunks
            }
          }
        }
      } catch (error) {
        console.error("Error during deliberation:", error)
        setStreamingState(initialStreamingState)
      }
    },
    [currentChat, createChat, fetchChat, fetchChats]
  )

  useEffect(() => {
    fetchChats()
  }, [fetchChats])

  return {
    chats,
    currentChat,
    streamingState,
    selectChat,
    createChat,
    deleteChat,
    sendMessage,
  }
}
