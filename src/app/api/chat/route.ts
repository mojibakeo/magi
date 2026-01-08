import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/infrastructures/db"

export const GET = async () => {
  const chats = await prisma.chat.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  return NextResponse.json(chats)
}

type CreateChatBody = {
  title?: string
}

export const POST = async (request: NextRequest) => {
  const body = (await request.json()) as CreateChatBody
  const title = body.title ?? "New Chat"

  const chat = await prisma.chat.create({
    data: { title },
  })

  return NextResponse.json(chat, { status: 201 })
}
