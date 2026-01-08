import Anthropic from "@anthropic-ai/sdk"
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

const convertImageToContent = (
  file: FileAttachment
): Anthropic.ImageBlockParam => {
  const mediaType = file.mimeType as
    | "image/jpeg"
    | "image/png"
    | "image/gif"
    | "image/webp"
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mediaType,
      data: file.data,
    },
  }
}

const convertPdfToContent = (
  file: FileAttachment
): Anthropic.DocumentBlockParam => {
  return {
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
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

const buildMessages = (request: LLMRequest): Anthropic.MessageParam[] => {
  return request.messages.map((msg, index) => {
    const isLastUserMessage =
      msg.role === "user" && index === request.messages.length - 1
    const contextSuffix = isLastUserMessage
      ? buildOtherOpinionsContext(request.otherOpinions, request.rejectionReasons)
      : ""

    let contentWithContext = msg.content + contextSuffix
    const validFiles = msg.files?.filter((f) => f.data && f.data.length > 0) ?? []

    if (validFiles.length > 0) {
      const content: Anthropic.ContentBlockParam[] = []

      for (const file of validFiles) {
        if (file.mimeType.startsWith("image/")) {
          content.push(convertImageToContent(file))
        } else if (file.mimeType === "application/pdf") {
          content.push(convertPdfToContent(file))
        } else if (
          file.mimeType === "text/plain" ||
          file.mimeType === "text/markdown"
        ) {
          const textContent = decodeBase64Text(file.data)
          contentWithContext = `[添付ファイル: ${file.name}]\n\`\`\`\n${textContent}\n\`\`\`\n\n${contentWithContext}`
        }
      }

      content.push({ type: "text", text: contentWithContext })
      return { role: msg.role, content }
    }

    return { role: msg.role, content: contentWithContext }
  })
}

export const createClaudeClient = (apiKey: string): LLMClient => {
  const client = new Anthropic({ apiKey })
  const system = "melchior" as const

  return {
    system,
    chat: async (request: LLMRequest): Promise<string> => {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPTS[system],
        messages: buildMessages(request),
      })

      const textBlock = response.content.find((block) => block.type === "text")
      return textBlock?.text ?? ""
    },
    stream: async function* (
      request: LLMRequest
    ): AsyncGenerator<LLMStreamChunk> {
      const stream = await client.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: SYSTEM_PROMPTS[system],
        messages: buildMessages(request),
      })

      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          yield {
            system,
            content: event.delta.text,
            done: false,
          }
        }
      }

      yield { system, content: "", done: true }
    },
  }
}
