import Anthropic from "@anthropic-ai/sdk"
import type { MagiClients, LLMRequest, LLMStreamChunk } from "./index"
import type {
  MagiSystem,
  LLMMessage,
  LLMResponse,
  DeliberationRound,
} from "@/types/llm"

const STANCE_PATTERN = /MY STANCE:\s*(.+?)(?:\n|$)/i

const extractStance = (content: string): string => {
  const match = content.match(STANCE_PATTERN)
  return match?.[1]?.trim() ?? content.slice(0, 200)
}

const generateUnifiedConclusion = async (
  responses: LLMResponse[]
): Promise<string> => {
  const anthropic = new Anthropic()

  const opinionsText = responses
    .map((r) => `【${r.system.toUpperCase()}】\n${r.content}`)
    .join("\n\n---\n\n")

  const prompt = `以下は3つのAIシステム（MAGI）が議論した結果です。これらの意見を統合し、1つの明確で読みやすい結論を生成してください。

${opinionsText}

要件：
- 3つの意見の共通点と重要なポイントを抽出して統合する
- 各システム名への言及は不要（統合された1つの結論として書く）
- 日本語で回答する

Markdown整形ルール（必須）：
- 必ず「## 結論」から始める
- 適切に「### 小見出し」を使ってセクション分けする
- 情報の整理には**テーブルを優先的に使用**する（比較、一覧、項目と説明の対応など）
- テーブルでは表現しにくい場合のみ箇条書きリスト（-）を使う
- 手順やステップがある場合は番号付きリスト（1. 2. 3.）を使う
- 重要なキーワードは**太字**にする
- 段落間には空行を入れて読みやすくする

統合結論：`

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    })

    const content = response.content[0]
    if (!content || content.type !== "text") {
      return responses.map((r) => r.content).join("\n\n")
    }

    return content.text
  } catch (error) {
    console.error("Failed to generate unified conclusion:", error)
    return responses.map((r) => r.content).join("\n\n")
  }
}

export type VoteResult = {
  system: MagiSystem
  approve: boolean
  reason: string
}

export type DeliberationEvent =
  | { type: "round_start"; round: number }
  | { type: "stream"; system: MagiSystem; content: string }
  | { type: "response_complete"; system: MagiSystem; content: string }
  | { type: "round_complete"; round: DeliberationRound }
  | { type: "generating_conclusion" }
  | { type: "conclusion_generated"; conclusion: string }
  | { type: "voting_start" }
  | { type: "vote"; result: VoteResult }
  | { type: "voting_complete"; approved: boolean; votes: VoteResult[] }
  | {
      type: "consensus_reached"
      conclusion: string
      round: number
      votes: VoteResult[]
    }
  | {
      type: "max_rounds_reached"
      conclusion: string
      round: number
      votes: VoteResult[]
    }
  | { type: "error"; system: MagiSystem; error: string }

const voteOnConclusion = async (
  clients: MagiClients,
  conclusion: string,
  originalQuestion: string
): Promise<VoteResult[]> => {
  const systems: MagiSystem[] = ["melchior", "balthasar", "casper"]

  const votePromises = systems.map(async (system) => {
    const voteRequest = {
      messages: [
        {
          role: "user" as const,
          content: `以下の質問に対するMAGIシステムの統合結論について、あなたは賛成か反対かを投票してください。

## 元の質問
${originalQuestion}

## 統合結論
${conclusion}

## 投票方法
以下の形式で回答してください：

VOTE: APPROVE または REJECT
REASON: 賛成/反対の理由（1-2文で簡潔に）

重要：
- 結論が質問に対して適切で、論理的に正しければ APPROVE
- 結論に重大な誤りや不足があれば REJECT
- 細かい表現の違いは気にせず、本質的な内容で判断してください`,
        },
      ],
    }

    try {
      const response = await clients[system].chat(voteRequest)
      const approveMatch = response.match(/VOTE:\s*(APPROVE|REJECT)/i)
      const reasonMatch = response.match(/REASON:\s*(.+?)(?:\n|$)/i)

      return {
        system,
        approve: approveMatch?.[1]?.toUpperCase() === "APPROVE",
        reason: reasonMatch?.[1]?.trim() ?? "理由なし",
      }
    } catch (error) {
      console.error(`Vote failed for ${system}:`, error)
      return {
        system,
        approve: false,
        reason: "投票エラー",
      }
    }
  })

  return Promise.all(votePromises)
}

export type DeliberationConfig = {
  minRounds: number
  maxRounds: number
}

type PendingStream = {
  system: MagiSystem
  iterator: AsyncIterator<LLMStreamChunk>
  content: string
  done: boolean
  failed: boolean
  pendingPromise?: Promise<{ system: MagiSystem; result: IteratorResult<LLMStreamChunk> }>
}

const STREAM_TIMEOUT_MS = 60000

const createTimeoutPromise = (ms: number): Promise<never> =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Stream timeout")), ms)
  )

const safeCreateStream = (
  client: { stream: (req: LLMRequest) => AsyncGenerator<LLMStreamChunk> },
  request: LLMRequest,
  system: MagiSystem
): PendingStream => {
  try {
    return {
      system,
      iterator: client.stream(request)[Symbol.asyncIterator](),
      content: "",
      done: false,
      failed: false,
    }
  } catch (error) {
    console.error(`Failed to create stream for ${system}:`, error)
    return {
      system,
      iterator: {
        next: async () => ({ done: true, value: undefined }),
      } as AsyncIterator<LLMStreamChunk>,
      content: `[${system.toUpperCase()}]: エラーが発生しました。応答を取得できませんでした。`,
      done: true,
      failed: true,
    }
  }
}

export const deliberate = async function* (
  clients: MagiClients,
  messages: LLMMessage[],
  config: DeliberationConfig
): AsyncGenerator<DeliberationEvent> {
  const rounds: DeliberationRound[] = []
  let previousResponses: LLMResponse[] = []
  let previousRejectionReasons: string[] = []

  const originalQuestion =
    messages.find((m) => m.role === "user")?.content ?? ""

  for (let roundNumber = 1; roundNumber <= config.maxRounds; roundNumber++) {
    yield { type: "round_start", round: roundNumber }

    const request: LLMRequest = {
      messages,
      otherOpinions:
        roundNumber > 1
          ? previousResponses.map((r) => ({
              system: r.system,
              content: r.content,
            }))
          : undefined,
      rejectionReasons:
        previousRejectionReasons.length > 0
          ? previousRejectionReasons
          : undefined,
    }

    const systems: MagiSystem[] = ["melchior", "balthasar", "casper"]
    const pendingStreams: PendingStream[] = systems.map((system) =>
      safeCreateStream(clients[system], request, system)
    )

    const getNextChunk = (stream: PendingStream) => {
      if (!stream.pendingPromise && !stream.done) {
        stream.pendingPromise = Promise.race([
          stream.iterator.next().then((result) => ({
            system: stream.system,
            result,
            timeout: false,
          })),
          createTimeoutPromise(STREAM_TIMEOUT_MS).catch(() => ({
            system: stream.system,
            result: { done: true, value: undefined } as IteratorResult<LLMStreamChunk>,
            timeout: true,
          })),
        ])
      }
      return stream.pendingPromise
    }

    while (pendingStreams.some((s) => !s.done)) {
      const activeStreams = pendingStreams.filter((s) => !s.done)
      const promises = activeStreams
        .map((s) => getNextChunk(s))
        .filter((p): p is NonNullable<typeof p> => p !== undefined)

      if (promises.length === 0) break

      try {
        const raceResult = await Promise.race(promises)
        const { system, result, timeout } = raceResult as {
          system: MagiSystem
          result: IteratorResult<LLMStreamChunk>
          timeout?: boolean
        }
        const stream = pendingStreams.find((s) => s.system === system)
        if (!stream) continue

        stream.pendingPromise = undefined

        if (timeout) {
          stream.done = true
          stream.failed = true
          if (!stream.content) {
            stream.content = `[${system.toUpperCase()}]: タイムアウトしました。応答を取得できませんでした。`
          }
          yield { type: "error", system, error: "Stream timeout" }
          continue
        }

        if (result.done) {
          stream.done = true
        } else {
          const chunk = result.value
          if (!chunk.done && chunk.content) {
            stream.content += chunk.content
            yield { type: "stream", system, content: chunk.content }
          }
          if (chunk.done) {
            stream.done = true
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error"
        for (const stream of activeStreams) {
          if (!stream.done) {
            stream.done = true
            stream.failed = true
            if (!stream.content) {
              stream.content = `[${stream.system.toUpperCase()}]: エラーが発生しました: ${errorMsg}`
            }
            yield { type: "error", system: stream.system, error: errorMsg }
          }
        }
      }
    }

    // 全てのLLMが失敗した場合はエラーを投げる
    const successfulResponses = pendingStreams.filter((s) => !s.failed && s.content)
    if (successfulResponses.length === 0) {
      throw new Error("All LLMs failed to respond")
    }

    const currentResponses: LLMResponse[] = []
    for (const stream of pendingStreams) {
      const opinion = extractStance(stream.content)
      currentResponses.push({
        system: stream.system,
        content: stream.content,
        opinion,
      })
      yield {
        type: "response_complete",
        system: stream.system,
        content: stream.content,
      }
    }

    currentResponses.sort((a, b) => a.system.localeCompare(b.system))

    const round: DeliberationRound = {
      number: roundNumber,
      responses: currentResponses,
    }
    rounds.push(round)

    yield { type: "round_complete", round }

    // 統合結論を生成
    yield { type: "generating_conclusion" }
    const unifiedConclusion = await generateUnifiedConclusion(currentResponses)
    yield { type: "conclusion_generated", conclusion: unifiedConclusion }

    // 3つのLLMに投票させる
    yield { type: "voting_start" }
    const votes = await voteOnConclusion(clients, unifiedConclusion, originalQuestion)

    for (const vote of votes) {
      yield { type: "vote", result: vote }
    }

    const approveCount = votes.filter((v) => v.approve).length
    const approved = approveCount >= 2

    yield { type: "voting_complete", approved, votes }

    // minRounds 以上かつ2票以上で合意成立
    if (approved && roundNumber >= config.minRounds) {
      yield {
        type: "consensus_reached",
        conclusion: unifiedConclusion,
        round: roundNumber,
        votes,
      }
      return
    }

    // 反対理由を次のラウンドに渡す
    previousRejectionReasons = votes
      .filter((v) => !v.approve)
      .map((v) => `${v.system.toUpperCase()}: ${v.reason}`)
    previousResponses = currentResponses
  }

  // max rounds に達した場合、最後の結論と投票結果を返す
  const lastRound = rounds[rounds.length - 1]
  const finalConclusion = lastRound
    ? await generateUnifiedConclusion(lastRound.responses)
    : "No conclusion reached"

  // 最後のラウンドの投票を取得
  const finalVotes = await voteOnConclusion(clients, finalConclusion, originalQuestion)

  yield {
    type: "max_rounds_reached",
    conclusion: finalConclusion,
    round: config.maxRounds,
    votes: finalVotes,
  }
}
