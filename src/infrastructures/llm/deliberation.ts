import Anthropic from "@anthropic-ai/sdk"
import type { MagiClients, LLMRequest, LLMStreamChunk } from "./index"
import type {
  MagiSystem,
  LLMMessage,
  LLMResponse,
  DeliberationRound,
} from "@/types/llm"

type FeedbackForConclusion = {
  concerns: string[]
  suggestions: string[]
}

const generateUnifiedConclusion = async (
  responses: LLMResponse[],
  feedback?: FeedbackForConclusion
): Promise<string> => {
  const anthropic = new Anthropic()

  const opinionsText = responses
    .map((r) => `【${r.system.toUpperCase()}】\n${r.content}`)
    .join("\n\n---\n\n")

  const feedbackSection = feedback && (feedback.concerns.length > 0 || feedback.suggestions.length > 0)
    ? `

## 前回の投票からのフィードバック
${feedback.concerns.length > 0 ? `### 懸念点\n${feedback.concerns.map(c => `- ${c}`).join("\n")}` : ""}
${feedback.suggestions.length > 0 ? `### 改善提案\n${feedback.suggestions.map(s => `- ${s}`).join("\n")}` : ""}

上記のフィードバックを考慮して統合結論を生成してください。`
    : ""

  const prompt = `以下は3つのAIシステム（MAGI）が議論した結果です。これらの意見を統合し、1つの明確で読みやすい結論を生成してください。

${opinionsText}
${feedbackSection}

要件：
- 3つの視点の違いを理解し、それぞれの強みを活かして統合する
- 対立点がある場合は、その理由と解決の方向性を示す
- 一方的に平均化するのではなく、各視点が補完し合う形で結論を構築する
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

export type VoteStatus = "approve" | "partial" | "reject"

export type VoteResult = {
  system: MagiSystem
  status: VoteStatus
  approve: boolean // backward compatibility
  agreement: string
  concern: string
  suggestion: string
  reason: string // backward compatibility (combined summary)
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

const parseVoteStatus = (voteText: string | undefined): VoteStatus => {
  if (!voteText) return "reject"
  const upper = voteText.toUpperCase()
  if (upper === "APPROVE") return "approve"
  if (upper === "PARTIAL") return "partial"
  return "reject"
}

const extractSection = (response: string, sectionName: string): string => {
  const regex = new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n(?:VOTE|AGREEMENT|CONCERN|SUGGESTION):|$)`, "i")
  const match = response.match(regex)
  return match?.[1]?.trim() ?? ""
}

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
          content: `以下の質問に対するMAGIシステムの統合結論について評価してください。

## 元の質問
${originalQuestion}

## 統合結論
${conclusion}

## 投票方法
以下の形式で回答してください：

VOTE: APPROVE / PARTIAL / REJECT
- APPROVE: 結論に完全に同意する
- PARTIAL: 大筋は同意するが、改善点がある
- REJECT: 結論に重大な問題がある

AGREEMENT: この結論で同意できる点（箇条書きで1-3点）

CONCERN: 懸念点や改善が必要な点（なければ「なし」、箇条書きで1-3点）

SUGGESTION: より良い結論にするための具体的な提案（なければ「なし」）

重要：
- 完璧を求めず、ユーザーにとって有用な結論かどうかを判断基準とする
- 自分の分析と完全に一致しなくても、論理的に妥当であれば APPROVE または PARTIAL を選ぶ
- REJECT は重大な事実誤認や論理的欠陥がある場合のみ選択する`,
        },
      ],
    }

    try {
      const response = await clients[system].chat(voteRequest)
      const voteMatch = response.match(/VOTE:\s*(APPROVE|PARTIAL|REJECT)/i)
      const status = parseVoteStatus(voteMatch?.[1])
      const agreement = extractSection(response, "AGREEMENT")
      const concern = extractSection(response, "CONCERN")
      const suggestion = extractSection(response, "SUGGESTION")

      const reason = concern && concern !== "なし" ? concern : agreement

      return {
        system,
        status,
        approve: status === "approve" || status === "partial",
        agreement,
        concern,
        suggestion,
        reason,
      }
    } catch (error) {
      console.error(`Vote failed for ${system}:`, error)
      return {
        system,
        status: "reject" as VoteStatus,
        approve: false,
        agreement: "",
        concern: "投票エラー",
        suggestion: "",
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
  let previousFeedback: FeedbackForConclusion | undefined

  const originalQuestion =
    messages.find((m) => m.role === "user")?.content ?? ""

  for (let roundNumber = 1; roundNumber <= config.maxRounds; roundNumber++) {
    yield { type: "round_start", round: roundNumber }

    const feedbackText = previousFeedback
      ? [
          previousFeedback.concerns.length > 0
            ? `【懸念点】\n${previousFeedback.concerns.map(c => `- ${c}`).join("\n")}`
            : "",
          previousFeedback.suggestions.length > 0
            ? `【改善提案】\n${previousFeedback.suggestions.map(s => `- ${s}`).join("\n")}`
            : "",
        ].filter(Boolean).join("\n\n")
      : undefined

    const request: LLMRequest = {
      messages,
      otherOpinions:
        roundNumber > 1
          ? previousResponses.map((r) => ({
              system: r.system,
              content: r.content,
            }))
          : undefined,
      rejectionReasons: feedbackText ? [feedbackText] : undefined,
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
      currentResponses.push({
        system: stream.system,
        content: stream.content,
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
    const unifiedConclusion = await generateUnifiedConclusion(currentResponses, previousFeedback)
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

    // フィードバックを次のラウンドに渡す
    const concerns = votes
      .filter((v) => v.concern && v.concern !== "なし")
      .map((v) => `${v.system.toUpperCase()}: ${v.concern}`)
    const suggestions = votes
      .filter((v) => v.suggestion && v.suggestion !== "なし")
      .map((v) => `${v.system.toUpperCase()}: ${v.suggestion}`)

    previousFeedback = { concerns, suggestions }
    previousResponses = currentResponses
  }

  // max rounds に達した場合、最後の結論と投票結果を返す
  const lastRound = rounds[rounds.length - 1]
  const finalConclusion = lastRound
    ? await generateUnifiedConclusion(lastRound.responses, previousFeedback)
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
