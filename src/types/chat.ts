import type { MagiSystem } from "./llm"

export type ChatSummary = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

export type VoteStatus = "approve" | "partial" | "reject"

export type VoteData = {
  system: MagiSystem
  status: VoteStatus
  approve: boolean
  agreement: string
  concern: string
  suggestion: string
  reason: string
}

export type RoundData = {
  id: string
  number: number
  melchior: string
  balthasar: string
  casper: string
  consensus?: string
  votes?: VoteData[]
  conclusion?: string
}

export type FileData = {
  id: string
  name: string
  mimeType: string
  path: string
}

export type MessageData = {
  id: string
  role: "user" | "magi"
  content: string
  createdAt: string
  files: FileData[]
  rounds: RoundData[]
}

export type ChatData = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: MessageData[]
}

export type StreamingState = {
  isStreaming: boolean
  currentRound: number
  responses: Record<MagiSystem, string>
  rounds: RoundData[]
  currentConclusion?: string
  finalVotes?: VoteData[]
}
