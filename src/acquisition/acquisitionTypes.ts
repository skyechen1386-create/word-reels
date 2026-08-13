/** 单个语境例句 */
export interface ContextExample {
  de: string
  zh?: string // 完整中文翻译（用于后端评判，不显示给用户）
  source: 'examples' | 'rankedMeanings.contexts' | 'collocations.examples' | 'collocations.exampleDe' | 'definition.de' | 'matrix.coreModelDe'
}

/** 学习材料：一个词的完整学习资源 */
export interface ContextMaterial {
  entryId: string
  lemma: string
  meaningRank: number
  class: 'A' | 'B' | 'C'

  // 核心含义
  primaryZh: string
  coreDe?: string

  // 多个例句用于多轮猜测
  contexts: ContextExample[]

  // 搭配（用于最后的造句验证）
  recallPattern?: string
  recallZh?: string

  // 元数据
  tags?: string[]
  grammar?: Record<string, unknown>
  pronunciation?: { display?: string }
}

/** 单次猜测记录 */
export interface GuessRecord {
  attempt: number
  input: string
  correct: boolean
  timestamp: number
  contextUsed: number // 第几个例句
  hintsShown: string[] // 给过哪些线索
}

/** 习得进度记录（独立于 FSRS） */
export interface AcquisitionProgress {
  entryId: string
  meaningRank: number

  totalAttempts: number
  correctGuessAttempt?: number // 第几次猜对
  guessRecords: GuessRecord[]

  normalListenCount: number
  slowListenCount: number

  sentenceConfirmed: boolean // 是否通过造句验证
  confirmedSentence?: string

  completedAt: number
}

/** 当前学习会话状态 */
export interface AcquisitionSession {
  entryId: string
  material: ContextMaterial
  stage: 'guessing' | 'reveal' | 'confirm_sentence'

  // 猜测进度
  currentAttempt: number
  maxAttempts: number
  currentContextIndex: number
  guessRecords: GuessRecord[]
  lastGuessCorrect?: boolean

  // 朗读计数
  normalListenCount: number
  slowListenCount: number

  // 造句验证
  confirmedSentence?: string
}
