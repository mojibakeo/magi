import { createClaudeClient } from "./claude"
import { createOpenAIClient } from "./openai"
import { createGeminiClient } from "./gemini"
import type { LLMClient } from "./types"

export type { LLMClient, LLMRequest, LLMStreamChunk } from "./types"
export { SYSTEM_PROMPTS } from "./types"

export type MagiClients = {
  melchior: LLMClient
  balthasar: LLMClient
  casper: LLMClient
}

export const createMagiClients = (config: {
  anthropicApiKey: string
  openaiApiKey: string
  geminiApiKey: string
}): MagiClients => {
  return {
    melchior: createClaudeClient(config.anthropicApiKey),
    balthasar: createOpenAIClient(config.openaiApiKey),
    casper: createGeminiClient(config.geminiApiKey),
  }
}
