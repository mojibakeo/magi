export type MagiSystem = "melchior" | "balthasar" | "casper"

export type FileAttachment = {
  name: string
  mimeType: string
  data: string // base64 encoded
}

export type LLMMessage = {
  role: "user" | "assistant"
  content: string
  files?: FileAttachment[]
}

export type LLMResponse = {
  system: MagiSystem
  content: string
  opinion: string // extracted opinion/stance
}

export type DeliberationRound = {
  number: number
  responses: LLMResponse[]
  consensus?: string
}

export type DeliberationResult = {
  rounds: DeliberationRound[]
  finalConclusion: string
  consensusReached: boolean
}
