import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/infrastructures/db"

type RouteParams = {
  params: Promise<{ id: string }>
}

export const GET = async (_request: NextRequest, { params }: RouteParams) => {
  const { id } = await params

  const chat = await prisma.chat.findUnique({
    where: { id },
    include: {
      messages: {
        include: {
          files: true,
          rounds: {
            orderBy: { number: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  })

  if (!chat) {
    return NextResponse.json({ error: "Chat not found" }, { status: 404 })
  }

  return NextResponse.json(chat)
}

type UpdateChatBody = {
  title?: string
}

export const PATCH = async (request: NextRequest, { params }: RouteParams) => {
  const { id } = await params
  const body = (await request.json()) as UpdateChatBody

  const chat = await prisma.chat.update({
    where: { id },
    data: { title: body.title },
  })

  return NextResponse.json(chat)
}

export const DELETE = async (
  _request: NextRequest,
  { params }: RouteParams
) => {
  const { id } = await params

  await prisma.chat.delete({
    where: { id },
  })

  return new Response(null, { status: 204 })
}
