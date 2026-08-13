import type { ContextExample, AcquisitionSession, AcquisitionProgress } from './acquisitionTypes'

let currentUtterance: SpeechSynthesisUtterance | null = null

/**
 * 朗读德语句子
 * @param text 要朗读的文本
 * @param speed 速度：0.9（正常）或 0.65（慢速）
 */
export function speakSentence(text: string, speed: number = 0.9): void {
  // 停止当前朗读
  window.speechSynthesis.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'de-DE'
  utterance.rate = speed
  utterance.pitch = 1.0
  utterance.volume = 1.0

  currentUtterance = utterance
  window.speechSynthesis.speak(utterance)
}

/**
 * 停止当前朗读
 */
export function stopSpeech(): void {
  window.speechSynthesis.cancel()
  currentUtterance = null
}

/**
 * 自由输入判断（不依赖AI）
 * 执行以下检查：
 * 1. 清除空格和标点
 * 2. 从中文释义拆分关键词
 * 3. 模糊匹配
 */
export function evaluateGuess(userInput: string, targetZh: string, alternativeZh?: string[]): {
  status: 'exact' | 'close' | 'partial' | 'incorrect'
  feedback?: string
} {
  if (!userInput.trim()) {
    return { status: 'incorrect', feedback: '请输入你的答案。' }
  }

  const cleaned = cleanText(userInput)
  const targetCleaned = cleanText(targetZh)

  // 精确匹配
  if (cleaned === targetCleaned) {
    return { status: 'exact' }
  }

  // 精确匹配替代答案
  if (alternativeZh?.some(alt => cleaned === cleanText(alt))) {
    return { status: 'exact' }
  }

  // 模糊匹配：提取核心词
  const keywords = extractKeywords(targetZh)
  const userKeywords = extractKeywords(userInput)

  const matches = keywords.filter(kw => userKeywords.some(uk => isSimilar(uk, uk)))
  const matchRatio = keywords.length > 0 ? matches.length / keywords.length : 0

  if (matchRatio >= 0.8) {
    return { status: 'close' }
  }

  if (matchRatio >= 0.5) {
    return { status: 'partial' }
  }

  return { status: 'incorrect' }
}

/**
 * 清除空格和常见标点
 */
function cleanText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[，。、；：？！'"'"()（）]/g, '')
}

/**
 * 从中文文本中提取关键词
 */
function extractKeywords(text: string): string[] {
  const cleaned = cleanText(text)
  // 简单地按字符分割（中文逐字，英文逐词）
  const words: string[] = []
  let current = ''

  for (const char of cleaned) {
    // 中文字符范围
    if (/[一-龥]/.test(char)) {
      if (current.length > 0 && !/[一-龥]/.test(current)) {
        words.push(current)
        current = char
      } else {
        current += char
      }
    } else if (/[a-z0-9]/.test(char)) {
      current += char
    } else {
      if (current.length > 0) words.push(current)
      current = ''
    }
  }

  if (current.length > 0) words.push(current)

  // 过滤掉太短的词（单字英文除外）
  return words.filter(w => w.length > 1 || /[a-z]/.test(w))
}

/**
 * 简单的相似度判断
 */
function isSimilar(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 2) return false

  // 编辑距离 <= 1
  const dist = levenshteinDistance(a, b)
  return dist <= 1
}

/**
 * Levenshtein 距离
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * 创建习得进度记录
 */
export function createAcquisitionProgress(
  session: AcquisitionSession,
  recallResult: 'correct' | 'partial' | 'incorrect'
): AcquisitionProgress {
  // 找出第一次正确的猜测
  const correctRecord = session.guessRecords.find(r => r.correct)

  return {
    entryId: session.entryId,
    meaningRank: session.material.meaningRank,
    totalAttempts: session.guessRecords.length,
    correctGuessAttempt: correctRecord ? correctRecord.attempt : undefined,
    guessRecords: session.guessRecords,
    normalListenCount: session.normalListenCount,
    slowListenCount: session.slowListenCount,
    sentenceConfirmed: recallResult === 'correct',
    confirmedSentence: session.confirmedSentence,
    completedAt: Date.now(),
  }
}

/**
 * 验证朗读计数
 */
export function incrementListenCount(session: AcquisitionSession, speed: 'normal' | 'slow'): void {
  if (speed === 'normal') {
    session.normalListenCount++
  } else {
    session.slowListenCount++
  }
}
