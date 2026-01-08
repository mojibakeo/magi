const getEnvVar = (key: string): string => {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`)
  }
  return value
}

const getOptionalEnvVar = (key: string, defaultValue: string): string => {
  return process.env[key] ?? defaultValue
}

export const env = {
  anthropicApiKey: () => getEnvVar("ANTHROPIC_API_KEY"),
  openaiApiKey: () => getEnvVar("OPENAI_API_KEY"),
  geminiApiKey: () => getEnvVar("GEMINI_API_KEY"),
  magiMinRounds: () =>
    parseInt(getOptionalEnvVar("MAGI_MIN_ROUNDS", "3"), 10),
  magiMaxRounds: () =>
    parseInt(getOptionalEnvVar("MAGI_MAX_ROUNDS", "20"), 10),
}
