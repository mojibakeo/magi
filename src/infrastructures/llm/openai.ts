import OpenAI from "openai"
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
): OpenAI.Chat.ChatCompletionContentPartImage => {
  return {
    type: "image_url",
    image_url: {
      url: `data:${file.mimeType};base64,${file.data}`,
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

const buildMessages = (
  request: LLMRequest
): OpenAI.Chat.ChatCompletionMessageParam[] => {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPTS.balthasar },
  ]

  for (let i = 0; i < request.messages.length; i++) {
    const msg = request.messages[i]
    if (!msg) continue

    const isLastUserMessage =
      msg.role === "user" && i === request.messages.length - 1
    const contextSuffix = isLastUserMessage
      ? buildOtherOpinionsContext(request.otherOpinions, request.rejectionReasons)
      : ""

    let contentWithContext = msg.content + contextSuffix
    const validFiles = msg.files?.filter((f) => f.data && f.data.length > 0) ?? []

    if (validFiles.length > 0 && msg.role === "user") {
      const content: OpenAI.Chat.ChatCompletionContentPart[] = []

      for (const file of validFiles) {
        if (file.mimeType.startsWith("image/")) {
          content.push(convertImageToContent(file))
        } else if (
          file.mimeType === "text/plain" ||
          file.mimeType === "text/markdown" ||
          file.mimeType === "application/pdf"
        ) {
          const textContent =
            file.mimeType === "application/pdf"
              ? "[PDFファイルが添付されています。内容を分析してください。]"
              : decodeBase64Text(file.data)
          contentWithContext = `[添付ファイル: ${file.name}]\n\`\`\`\n${textContent}\n\`\`\`\n\n${contentWithContext}`
        }
      }

      content.push({ type: "text", text: contentWithContext })
      result.push({ role: "user", content })
    } else {
      result.push({ role: msg.role, content: contentWithContext })
    }
  }

  return result
}

export const createOpenAIClient = (apiKey: string): LLMClient => {
  const client = new OpenAI({ apiKey })
  const system = "balthasar" as const

  return {
    system,
    chat: async (request: LLMRequest): Promise<string> => {
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: buildMessages(request),
      })

      return response.choices[0]?.message?.content ?? ""
    },
    stream: async function* (
      request: LLMRequest
    ): AsyncGenerator<LLMStreamChunk> {
      const stream = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 4096,
        messages: buildMessages(request),
        stream: true,
      })

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          yield {
            system,
            content,
            done: false,
          }
        }
      }

      yield { system, content: "", done: true }
    },
  }
}
