export type StudyAngle = 'recognition' | 'production' | 'meaning_context' | 'pronunciation' | 'word_building' | 'connection' | 'collocation' | 'collocation_example' | 'full'
export type Rating = 1 | 2 | 3 | 4 | 5

export interface LocalizedText { de?: string; zh?: string }
export interface RankedContext { sceneZh?: string; patternDe?: string; exampleDe?: string; exampleZh?: string }
export interface RankedMeaning { rank: number; zh: string; usageZh?: string; de?: string; contexts?: RankedContext[] }
export interface WordPart { part: string; meaningZh?: string; meaningDe?: string; role?: string }
export interface ConnectionMemory { type?: string; de?: string; zh?: string; title?: string; content?: string }
export interface Collocation { de: string; zh?: string; exampleDe?: string; exampleZh?: string }

export interface WordEntry {
  schema: string
  id: string
  language: string
  lemma: string
  displayForm: string
  grammar?: Record<string, unknown>
  dictionaryMeaning?: { directZh?: string[]; directDe?: string[] }
  rankedMeanings?: RankedMeaning[]
  definition?: LocalizedText
  coreAssociation?: LocalizedText
  pronunciation?: { ipa?: string; syllables?: string[]; display?: string; notesZh?: string[] }
  wordBuilding?: { type?: string; parts?: WordPart[]; structureZh?: string; structureDe?: string; notesZh?: string[]; noteZh?: string }
  connectionMemory?: ConnectionMemory[] | { links?: ConnectionMemory[]; textZh?: string }
  mnemonic?: { zh?: string; textZh?: string; de?: string; warningZh?: string }
  collocations?: Collocation[]
  tags?: string[]
  source?: string
  createdAt?: number
  updatedAt?: number
  [key: string]: unknown
}

export interface ReviewUnit {
  id: string
  entryId: string
  angle: StudyAngle
  variant: number
  prompt: string
  promptDetail?: string
  answer: string
  answerDetail?: string
  dueAt: number
  intervalMs: number
  stability: number
  difficulty: number
  reps: number
  lapses: number
  lastRating?: Rating
  lastReviewAt?: number
}

export interface ReviewLog {
  id?: number
  unitId: string
  entryId: string
  angle: StudyAngle
  rating: Rating
  responseTimeMs: number
  reviewedAt: number
  dueAt: number
}

export interface Backup {
  schema: 'wordreels-backup-v6'
  exportedAt: string
  appVersion: string
  entries: WordEntry[]
  units: ReviewUnit[]
  logs: ReviewLog[]
  settings: Record<string, unknown>
}
