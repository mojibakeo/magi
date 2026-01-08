import {
  GoogleGenerativeAI,
  type Content,
  type Part,
} from "@google/generative-ai"
import type { LLMClient, LLMRequest, LLMStreamChunk } from "./types"
import { SYSTEM_PROMPTS } from "./types"
import type { FileAttachment } from "@/types/llm"

const buildOtherOpinionsContext = (
  otherOpinions?: LLMRequest["otherOpinions"],
  rejectionReasons?: string[]
): string => {
  const parts: string[] = []

  if (otherOpinions && otherOpinions.length > 0) {
    const opinionTexts = otherOpinions
      .map((op) => `[${op.system.toUpperCase()}]: ${op.content}`)
      .join("\n\n")
    parts.push(
      `The other MAGI systems have expressed the following opinions:\n\n${opinionTexts}`
    )
  }

  if (rejectionReasons && rejectionReasons.length > 0) {
    parts.push(
      `前回の統合結論は以下の理由で否決されました。これらの点を考慮して改善してください:\n\n${rejectionReasons.join("\n")}`
    )
  }

  if (parts.length === 0) {
    return ""
  }

  return `\n\n---\n\n## 他のMAGIシステムからの情報\n\n${parts.join("\n\n")}\n\n---\n\n上記の情報を考慮した上で、**最初に提示された質問に対して**あなた自身の分析と回答を提供してください。他のシステムの意見を参考にしつつも、元の質問への直接的な回答を忘れないでください。`
}

const convertFileToContent = (file: FileAttachment): Part => {
  return {
    inlineData: {
      mimeType: file.mimeType,
      data: file.data,
    },
  }
}

const decodeBase64Text = (data: string): string => {
  try {
    return atob(data)
  } catch {
    return Buffer.from(data, "base64").toString("utf-8")
  }
}

const buildContents = (request: LLMRequest): Content[] => {
  const result: Content[] = []

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i]
    if (!msg) continue

    const isLastUserMessage =
      msg.role === "user" && i === request.messages.length - 1
    const contextSuffix = isLastUserMessage
      ? buildOtherOpinionsContext(request.otherOpinions, request.rejectionReasons)
      : ""

    let contentWithContext = msg.content + contextSuffix
    const role = msg.role === "assistant" ? "model" : "user"
    const validFiles = msg.files?.filter((f) => f.data && f.data.length > 0) ?? []

    const parts: Part[] = []

    if (validFiles.length > 0) {
      for (const file of validFiles) {
        if (
          file.mimeType.startsWith("image/") ||
          file.mimeType === "application/pdf"
        ) {
          parts.push(convertFileToContent(file))
        } else if (
          file.mimeType === "text/plain" ||
          file.mimeType === "text/markdown"
        ) {
          const textContent = decodeBase64Text(file.data)
          contentWithContext = `[添付ファイル: ${file.name}]\n\`\`\`\n${textContent}\n\`\`\`\n\n${contentWithContext}`
        }
      }
    }

    parts.push({ text: contentWithContext })
    result.push({ role, parts })
  }

  return result
}

export const createGeminiClient = (apiKey: string): LLMClient => {
  const genAI = new GoogleGenerativeAI(apiKey)
  const system = "casper" as const

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: SYSTEM_PROMPTS[system],
  })

  return {
    system,
    chat: async (request: LLMRequest): Promise<string> => {
      const contents = buildContents(request)
      const result = await model.generateContent({ contents })
      return result.response.text()
    },
    stream: async function* (
      request: LLMRequest
    ): AsyncGenerator<LLMStreamChunk> {
      const contents = buildContents(request)
      const result = await model.generateContentStream({ contents })

      for await (const chunk of result.stream) {
        const text = chunk.text()
        if (text) {
          yield {
            system,
            content: text,
            done: false,
          }
        }
      }

      yield { system, content: "", done: true }
    },
  }
}
