import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createMagiClients } from "@/infrastructures/llm"
import {
  deliberate,
  type DeliberationEvent,
} from "@/infrastructures/llm/deliberation"
import { prisma } from "@/infrastructures/db"
import type { Message, File } from "@/generated/prisma/client"
import { env } from "@/utils/env"
import type { LLMMessage, FileAttachment, MagiSystem } from "@/types/llm"

type MessageWithFiles = Message & { files: File[] }

type RequestBody = {
  chatId: string
  message: string
  files?: FileAttachment[]
}

const formatSSEMessage = (event: DeliberationEvent): string => {
  return `data: ${JSON.stringify(event)}\n\n`
}

const generateChatSummary = async (message: string): Promise<string> => {
  try {
    const anthropic = new Anthropic()
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 50,
      messages: [
        {
          role: "user",
          content: `以下のメッセージの内容を10文字以内の日本語で要約してください。タイトルとして使うので簡潔に。

メッセージ: ${message}

要約:`,
        },
      ],
    })

    const content = response.content[0]
    if (content?.type === "text") {
      return content.text.trim().slice(0, 30)
    }
    return message.slice(0, 20)
  } catch (error) {
    console.error("Failed to generate chat summary:", error)
    return message.slice(0, 20)
  }
}

export const POST = async (request: NextRequest) => {
  const body = (await request.json()) as RequestBody
  const { chatId, message, files } = body

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      messages: {
        include: { files: true, rounds: true },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!chat) {
    return new Response(JSON.stringify({ error: "Chat not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }

  const isFirstMessage = chat.messages.length === 0

  await prisma.message.create({
    data: {
      chatId,
      role: "user",
      content: message,
      files: files
        ? {
            create: files.map((f) => ({
              name: f.name,
              mimeType: f.mimeType,
              path: "",
            })),
          }
        : undefined,
    },
  })

  if (isFirstMessage) {
    const summary = await generateChatSummary(message)
    await prisma.chat.update({
      where: { id: chatId },
      data: { title: summary },
    })
  }

  const previousMessages: LLMMessage[] = chat.messages.map(
    (m: MessageWithFiles) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      files: m.files.map((f: File) => ({
        name: f.name,
        mimeType: f.mimeType,
        data: "",
      })),
    })
  )

  const currentMessage: LLMMessage = {
    role: "user",
    content: message,
    files,
  }

  const allMessages = [...previousMessages, currentMessage]

  const clients = createMagiClients({
    anthropicApiKey: env.anthropicApiKey(),
    openaiApiKey: env.openaiApiKey(),
    geminiApiKey: env.geminiApiKey(),
  })

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let magiMessageId: string | undefined
      let lastRoundId: string | undefined

      try {
        for await (const event of deliberate(clients, allMessages, {
          minRounds: env.magiMinRounds(),
          maxRounds: env.magiMaxRounds(),
        })) {
          controller.enqueue(encoder.encode(formatSSEMessage(event)))

          if (event.type === "round_complete") {
            if (!magiMessageId) {
              const magiMessage = await prisma.message.create({
                data: {
                  chatId,
                  role: "magi",
                  content: "",
                },
              })
              magiMessageId = magiMessage.id
            }

            const round = await prisma.round.create({
              data: {
                messageId: magiMessageId,
                number: event.round.number,
                melchior:
                  event.round.responses.find(
                    (r) => r.system === "melchior"
                  )?.content ?? "",
                balthasar:
                  event.round.responses.find(
                    (r) => r.system === "balthasar"
                  )?.content ?? "",
                casper:
                  event.round.responses.find(
                    (r) => r.system === "casper"
                  )?.content ?? "",
                consensus: event.round.consensus,
              },
            })
            lastRoundId = round.id
          }

          if (event.type === "conclusion_generated") {
            if (lastRoundId) {
              await prisma.round.update({
                where: { id: lastRoundId },
                data: { conclusion: event.conclusion },
              })
            }
          }

          if (
            event.type === "consensus_reached" ||
            event.type === "max_rounds_reached"
          ) {
            if (magiMessageId) {
              await prisma.message.update({
                where: { id: magiMessageId },
                data: { content: event.conclusion },
              })
            }
          }
        }
      } catch (error) {
        const errorEvent: DeliberationEvent = {
          type: "error",
          system: "melchior" as MagiSystem,
          error: error instanceof Error ? error.message : "Unknown error",
        }
        controller.enqueue(encoder.encode(formatSSEMessage(errorEvent)))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
