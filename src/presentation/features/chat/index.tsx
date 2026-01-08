"use client"

import type { FC } from "react"
import { useRef, useEffect, useState, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import type { MessageData, StreamingState, RoundData, VoteData } from "@/types/chat"
import type { FileAttachment, MagiSystem } from "@/types/llm"
import { ChatInput } from "@/presentation/ui/Input"
import { MagiPanel } from "@/presentation/ui/MagiPanel"

type ChatProps = {
  messages: MessageData[]
  streamingState: StreamingState
  onSendMessage: (message: string, files: FileAttachment[]) => void
}

const UserMessage: FC<{ message: MessageData }> = ({ message }) => (
  <div className="flex justify-end">
    <div className="max-w-[70%] rounded-lg bg-[var(--primary)] px-4 py-2">
      <p className="whitespace-pre-wrap text-sm">{message.content}</p>
      {message.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {message.files.map((file) => (
            <span
              key={file.id}
              className="rounded bg-black/20 px-2 py-0.5 text-xs"
            >
              {file.name}
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
)

const VotingResult: FC<{ votes: VoteData[] }> = ({ votes }) => {
  const approveCount = votes.filter((v) => v.approve).length

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-medium text-gray-400">投票結果:</span>
        <span
          className={`text-xs font-bold ${
            approveCount >= 2 ? "text-green-400" : "text-yellow-400"
          }`}
        >
          {approveCount}/3 賛成
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {votes.map((vote) => (
          <div
            key={vote.system}
            className={`rounded px-2 py-1 text-xs ${
              vote.approve
                ? "bg-green-900/30 text-green-400"
                : "bg-red-900/30 text-red-400"
            }`}
          >
            <div className="font-medium">
              {vote.system.toUpperCase()}: {vote.approve ? "賛成" : "反対"}
            </div>
            <div className="text-gray-400 truncate" title={vote.reason}>
              {vote.reason}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const formatVoterNames = (votes: VoteData[]): { approve: string; reject: string } => {
  const approvers = votes.filter((v) => v.approve).map((v) => v.system.toUpperCase())
  const rejecters = votes.filter((v) => !v.approve).map((v) => v.system.toUpperCase())
  return {
    approve: approvers.join(", ") || "なし",
    reject: rejecters.join(", ") || "なし",
  }
}

const RoundDisplay: FC<{
  round: RoundData
  isExpanded: boolean
  onToggle: () => void
  isFinal?: boolean
}> = ({ round, isExpanded, onToggle, isFinal = false }) => {
  const approveCount = round.votes?.filter((v) => v.approve).length ?? 0
  const voterNames = round.votes ? formatVoterNames(round.votes) : undefined

  return (
    <div className={`border rounded-lg overflow-hidden ${isFinal ? "border-[var(--primary)]" : "border-[var(--border)]"}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2 bg-[var(--card-bg)] hover:bg-[var(--card-bg)]/80 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">Round {round.number}</span>
          {isFinal && (
            <span className="text-xs px-2 py-0.5 rounded bg-[var(--primary)]/20 text-[var(--primary)]">
              Final
            </span>
          )}
          {round.votes && (
            <span
              className={`text-xs px-2 py-0.5 rounded ${
                approveCount >= 2
                  ? "bg-green-900/30 text-green-400"
                  : "bg-yellow-900/30 text-yellow-400"
              }`}
            >
              {approveCount}/3 賛成
            </span>
          )}
          {voterNames && (
            <span className="text-xs text-gray-500">
              賛成: <span className="text-green-400">{voterNames.approve}</span>
              {" / "}
              反対: <span className="text-red-400">{voterNames.reject}</span>
            </span>
          )}
        </div>
        <span className="text-gray-500">{isExpanded ? "▼" : "▶"}</span>
      </button>
      {isExpanded && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <MagiPanel system="melchior" content={round.melchior} />
            <MagiPanel system="balthasar" content={round.balthasar} />
            <MagiPanel system="casper" content={round.casper} />
          </div>
          {round.votes && <VotingResult votes={round.votes} />}
          {round.conclusion && (
            <div className="rounded-lg border border-[var(--primary)]/50 bg-[var(--card-bg)]/50 p-4">
              <div className="text-xs text-[var(--primary)] mb-2 font-medium">統合結論:</div>
              <div className="prose prose-sm prose-invert max-w-none text-gray-300">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{round.conclusion}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const MagiMessage: FC<{ message: MessageData }> = ({ message }) => {
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(() => {
    if (message.rounds.length === 0) return new Set()
    return new Set([message.rounds.length])
  })

  const toggleRound = useCallback((roundNumber: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNumber)) {
        next.delete(roundNumber)
      } else {
        next.add(roundNumber)
      }
      return next
    })
  }, [])

  if (message.rounds.length === 0) {
    return (
      <div className="rounded-lg bg-[var(--card-bg)] p-4">
        <p className="text-sm text-gray-400">{message.content}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 px-1">議論履歴:</p>
      {message.rounds.map((round, index) => (
        <RoundDisplay
          key={round.id}
          round={round}
          isExpanded={expandedRounds.has(round.number)}
          onToggle={() => toggleRound(round.number)}
          isFinal={index === message.rounds.length - 1}
        />
      ))}
    </div>
  )
}

const StreamingMessage: FC<{ streamingState: StreamingState }> = ({
  streamingState,
}) => {
  const systems: MagiSystem[] = ["melchior", "balthasar", "casper"]
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())

  const toggleRound = useCallback((roundNumber: number) => {
    setExpandedRounds((prev) => {
      const next = new Set(prev)
      if (next.has(roundNumber)) {
        next.delete(roundNumber)
      } else {
        next.add(roundNumber)
      }
      return next
    })
  }, [])

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 px-1">議論履歴:</p>

      {streamingState.rounds.map((round) => (
        <RoundDisplay
          key={round.id}
          round={round}
          isExpanded={expandedRounds.has(round.number)}
          onToggle={() => toggleRound(round.number)}
        />
      ))}

      <div className="border border-[var(--primary)] rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-[var(--card-bg)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Round {streamingState.currentRound}</span>
            <span className="animate-pulse text-xs text-[var(--primary)]">
              Deliberating...
            </span>
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {systems.map((system) => (
              <MagiPanel
                key={system}
                system={system}
                content={streamingState.responses[system]}
                isStreaming={!streamingState.responses[system]}
              />
            ))}
          </div>
          {streamingState.currentConclusion && (
            <>
              {streamingState.finalVotes && (
                <VotingResult votes={streamingState.finalVotes} />
              )}
              <div className="rounded-lg border border-[var(--primary)]/50 bg-[var(--card-bg)]/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-[var(--primary)] font-medium">統合結論:</span>
                  {!streamingState.finalVotes && (
                    <span className="animate-pulse text-xs text-yellow-400">
                      投票待ち...
                    </span>
                  )}
                </div>
                <div className="prose prose-sm prose-invert max-w-none text-gray-300">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingState.currentConclusion}</ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export const Chat: FC<ChatProps> = ({
  messages,
  streamingState,
  onSendMessage,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingState])

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 && !streamingState.isStreaming ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[var(--primary)]">
                MAGI System
              </h2>
              <p className="mt-2 text-gray-500">
                Three minds, one conclusion. Ask anything.
              </p>
              <div className="mt-4 flex justify-center gap-4 text-xs">
                <span className="text-[var(--melchior)]">● MELCHIOR</span>
                <span className="text-[var(--balthasar)]">● BALTHASAR</span>
                <span className="text-[var(--casper)]">● CASPER</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6 max-w-4xl mx-auto">
            {messages.map((message) =>
              message.role === "user" ? (
                <UserMessage key={message.id} message={message} />
              ) : (
                <MagiMessage key={message.id} message={message} />
              )
            )}
            {streamingState.isStreaming && (
              <StreamingMessage streamingState={streamingState} />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <ChatInput
        onSubmit={onSendMessage}
        disabled={streamingState.isStreaming}
      />
    </div>
  )
}
