import type { Rating, ReviewUnit, StudyAngle, WordEntry } from './types'

export const angleLabels: Record<StudyAngle, string> = {
  recognition: '德语 → 中文', production: '中文 → 德语', meaning_context: '常用义与语境',
  pronunciation: '拼读分段', word_building: '构词拆解', connection: '联系辅助记忆',
  collocation: '固定搭配', collocation_example: '搭配例句', full: '完整理解',
}

const DAY = 86_400_000
const text = (value: unknown): string => {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join('；')
  if (value && typeof value === 'object') {
    const item = value as Record<string, unknown>
    for (const key of ['coreZh', 'zh', 'de', 'textZh', 'text']) if (text(item[key])) return text(item[key])
  }
  return ''
}

const slug = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || crypto.randomUUID()

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

function normalizeGrammar(value: unknown) {
  const grammar = object(value)
  if (grammar.forms && typeof grammar.forms === 'object') return grammar
  const formText = text(grammar.forms)
  if (!formText) return grammar
  const parts = formText.split(/\s+[–—-]\s+/).map(item => item.trim()).filter(Boolean)
  if (parts.length < 3) return grammar
  return { ...grammar, forms: { 'Präsens': parts[0], 'Präteritum': parts[1], 'Perfekt': parts.slice(2).join(' – ') } }
}

function normalizeCollocations(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(item => {
    const source = object(item)
    const examples = Array.isArray(source.examples) ? source.examples.map(object) : []
    const first = examples[0] || {}
    return {
      de: text(source.de), zh: text(source.zh),
      exampleDe: text(source.exampleDe) || text(first.de),
      exampleZh: text(source.exampleZh) || text(first.zh),
    }
  }).filter(item => item.de)
}

function normalizeRankedMeanings(raw: Record<string, unknown>) {
  if (Array.isArray(raw.rankedMeanings) && raw.rankedMeanings.length) return raw.rankedMeanings as WordEntry['rankedMeanings']
  const meaning = object(raw.meaning)
  const values = Array.isArray(meaning.zh) ? meaning.zh.map(text).filter(Boolean)
    : Array.isArray(meaning.dictionaryZh) ? meaning.dictionaryZh.map(text).filter(Boolean)
      : [text(meaning.primaryZh || meaning.coreZh)].filter(Boolean)
  return values.map((zh, index) => ({ rank: index + 1, zh, contexts: [] }))
}

function normalizeConnections(value: unknown): WordEntry['connectionMemory'] {
  if (Array.isArray(value)) return value as WordEntry['connectionMemory']
  const source = object(value)
  const output: Array<{ type?: string; de?: string; zh?: string }> = []
  if (text(source.de) || text(source.zh)) output.push({ type: text(source.type), de: text(source.de), zh: text(source.zh) })
  if (Array.isArray(source.links)) {
    source.links.map(object).forEach(item => output.push({
      type: text(item.relationType || item.relation) || 'link',
      de: text(item.term || item.word || item.de || item.title),
      zh: text(item.explanationZh || item.noteZh || item.zh || item.content),
    }))
  }
  return output
}

function normalizeWordBuilding(value: unknown): WordEntry['wordBuilding'] {
  const source = object(value)
  if (!Object.keys(source).length) return undefined
  const rawParts = Array.isArray(source.parts) && source.parts.length ? source.parts : Array.isArray(source.components) ? source.components : []
  const parts = rawParts.map(item => {
    const part = object(item)
    return {
      part: text(part.part || part.form),
      meaningZh: text(part.meaningZh),
      meaningDe: text(part.meaningDe),
      role: text(part.role),
    }
  }).filter(item => item.part)
  return {
    ...source,
    parts,
    structureZh: text(source.structureZh) || text(source.formationZh) || text(source.summaryZh),
    notesZh: Array.isArray(source.notesZh) ? source.notesZh.map(text).filter(Boolean)
      : [text(source.noteZh), text(source.grammarRuleZh)].filter(Boolean),
  } as WordEntry['wordBuilding']
}

export function normalizeEntry(raw: Record<string, unknown>): WordEntry {
  const lemma = text(raw.lemma) || text(raw.displayForm)
  if (!lemma) throw new Error('词卡缺少 lemma 或 displayForm。')
  const meaning = (raw.meaning && typeof raw.meaning === 'object' ? raw.meaning : {}) as Record<string, unknown>
  const direct = raw.dictionaryMeaning && typeof raw.dictionaryMeaning === 'object'
    ? raw.dictionaryMeaning as { directZh?: string[]; directDe?: string[] }
    : { directZh: Array.isArray(meaning.zh) ? meaning.zh.map(text).filter(Boolean) : [text(meaning.coreZh || meaning.zh)].filter(Boolean) }
  const definition = raw.definition && typeof raw.definition === 'object' ? raw.definition as { de?: string; zh?: string } : { zh: text(raw.definition) }
  const grammar = normalizeGrammar(raw.grammar)
  const collocations = normalizeCollocations(raw.collocations)
  const meaningCore = object(raw.meaning)
  const pronunciationRaw = object(raw.pronunciation)
  const mnemonicRaw = object(raw.mnemonic)
  const now = Date.now()
  return {
    ...raw,
    schema: 'wordreels-word-v3',
    sourceSchema: text(raw.schema) || 'unversioned',
    id: text(raw.id) || `${text(raw.language) || 'de'}-${slug(lemma)}-${slug(text(grammar.pos) || 'word')}`,
    language: text(raw.language) || 'de', lemma,
    displayForm: text(raw.displayForm) || lemma,
    grammar, dictionaryMeaning: direct, definition,
    rankedMeanings: normalizeRankedMeanings(raw),
    coreAssociation: raw.coreAssociation && typeof raw.coreAssociation === 'object'
      ? raw.coreAssociation as WordEntry['coreAssociation']
      : { de: text(meaningCore.coreDe), zh: text(meaningCore.coreZh) },
    pronunciation: Object.keys(pronunciationRaw).length ? {
      ...pronunciationRaw,
      display: text(pronunciationRaw.display) || text(pronunciationRaw.segmented),
      syllables: Array.isArray(pronunciationRaw.syllables)
        ? pronunciationRaw.syllables.flatMap(item => text(item).split(/[·•]/)).map(item => item.trim()).filter(Boolean) : [],
      notesZh: Array.isArray(pronunciationRaw.notesZh) ? pronunciationRaw.notesZh.map(text).filter(Boolean) : [],
    } : undefined,
    wordBuilding: normalizeWordBuilding(raw.wordBuilding || raw.wordFormation),
    connectionMemory: normalizeConnections(raw.connectionMemory || raw.associationMemory),
    mnemonic: Object.keys(mnemonicRaw).length ? {
      ...mnemonicRaw,
      zh: text(mnemonicRaw.zh) || text(mnemonicRaw.memoryZh) || text(mnemonicRaw.textZh),
      warningZh: text(mnemonicRaw.warningZh) || text(mnemonicRaw.disclaimerZh),
    } : undefined,
    collocations,
    tags: Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [],
    createdAt: Number(raw.createdAt) || now, updatedAt: now,
  } as WordEntry
}

const coreZh = (entry: WordEntry) => entry.rankedMeanings?.find(item => item.rank === 1)?.zh
  || entry.dictionaryMeaning?.directZh?.[0] || entry.definition?.zh || ''

const make = (entry: WordEntry, angle: StudyAngle, variant: number, prompt: string, answer: string, promptDetail = '', answerDetail = ''): ReviewUnit => ({
  id: `${entry.id}::${angle}::${variant}`, entryId: entry.id, angle, variant, prompt, answer, promptDetail, answerDetail,
  dueAt: Date.now(), intervalMs: 0, stability: .4, difficulty: 5, reps: 0, lapses: 0,
})

function blankTarget(value: string, entry: WordEntry) {
  const candidates = [entry.displayForm, entry.lemma].filter(Boolean).sort((a, b) => b.length - a.length)
  let output = value
  for (const candidate of candidates) output = output.replace(new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '_____')
  return output === value ? value : output
}

export function generateUnits(entry: WordEntry): ReviewUnit[] {
  const units: ReviewUnit[] = []
  const zh = coreZh(entry)
  units.push(make(entry, 'recognition', 0, entry.displayForm, zh || '查看完整词条', '看到德语，回忆核心中文义'))
  if (zh) units.push(make(entry, 'production', 0, zh, entry.displayForm, [text(entry.grammar?.pos), text(entry.grammar?.level)].filter(Boolean).join(' · '), '根据中文主动回忆德语及拼写'))
  for (const meaning of entry.rankedMeanings || []) {
    const context = meaning.contexts?.[0]
    units.push(make(entry, 'meaning_context', meaning.rank, context?.sceneZh || meaning.usageZh || meaning.zh, entry.displayForm, `第 ${meaning.rank} 常用义 · ${meaning.zh}`, context?.patternDe || context?.exampleDe || ''))
  }
  const syllables = entry.pronunciation?.syllables || []
  if (syllables.length > 1) units.push(make(entry, 'pronunciation', 0, syllables.join(' · '), entry.displayForm, '根据拼读分段恢复完整拼写', entry.pronunciation?.ipa || ''))
  const parts = entry.wordBuilding?.parts || []
  if (parts.length) units.push(make(entry, 'word_building', 0, parts.map(part => `${part.part}${part.meaningZh ? `（${part.meaningZh}）` : ''}`).join(' + '), entry.displayForm, '根据构词成分推导完整词和含义', entry.wordBuilding?.structureZh || ''))
  const connections = Array.isArray(entry.connectionMemory) ? entry.connectionMemory : entry.connectionMemory?.links || []
  connections.forEach((item, index) => units.push(make(entry, 'connection', index, item.de || item.title || item.content || item.zh || '联系记忆', entry.displayForm, item.zh || '', '回忆它与目标词的联系')))
  ;(entry.collocations || []).forEach((item, index) => {
    units.push(make(entry, 'collocation', index, blankTarget(item.de, entry), item.de, item.zh || '补全固定搭配'))
    if (item.exampleDe) units.push(make(entry, 'collocation_example', index, item.exampleZh || blankTarget(item.exampleDe, entry), item.exampleDe, item.zh || '根据语境恢复德语表达'))
  })
  units.push(make(entry, 'full', 0, entry.displayForm, zh || entry.displayForm, '完整词条检查'))
  return units
}

export function mergeProgress(next: ReviewUnit[], old: ReviewUnit[]) {
  const current = new Map(old.map(item => [item.id, item]))
  return next.map(unit => current.has(unit.id) ? { ...unit, ...current.get(unit.id), prompt: unit.prompt, promptDetail: unit.promptDetail, answer: unit.answer, answerDetail: unit.answerDetail } : unit)
}

export function secureShuffle<T>(items: T[]): T[] {
  const output = [...items]
  const random = new Uint32Array(1)
  for (let index = output.length - 1; index > 0; index -= 1) {
    crypto.getRandomValues(random)
    const target = random[0] % (index + 1)
    ;[output[index], output[target]] = [output[target], output[index]]
  }
  return output
}

export function schedule(unit: ReviewUnit, rating: Rating, now = Date.now()): ReviewUnit {
  const base = Math.max(.35, unit.stability || .4)
  const first: Record<Rating, number> = { 1: 10 * 60_000, 2: 6 * 3_600_000, 3: DAY, 4: 2 * DAY, 5: 4 * DAY }
  const multipliers: Record<Rating, number> = { 1: .25, 2: .65, 3: 1.2, 4: 1.8, 5: 2.6 }
  const intervalMs = unit.reps === 0 ? first[rating] : Math.max(first[rating], base * multipliers[rating] * DAY)
  return {
    ...unit, dueAt: now + intervalMs, intervalMs,
    stability: rating === 1 ? Math.max(.35, base * .45) : Math.max(.35, base * multipliers[rating]),
    difficulty: Math.min(10, Math.max(1, unit.difficulty + ({ 1: 1.2, 2: .7, 3: .2, 4: -.15, 5: -.45 } as Record<Rating, number>)[rating])),
    reps: unit.reps + 1, lapses: unit.lapses + (rating === 1 ? 1 : 0), lastRating: rating, lastReviewAt: now,
  }
}

export function extractCards(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
  if (!payload || typeof payload !== 'object') throw new Error('JSON 必须是词卡数组、单张词卡或备份对象。')
  const root = payload as Record<string, unknown>
  if (text(root.schema).startsWith('wordreels-') && (text(root.lemma) || text(root.displayForm))) return [root]
  for (const key of ['entries', 'cards', 'words', 'items', 'data']) {
    const value = root[key]
    if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[]
  }
  throw new Error('没有找到可导入的词卡数组。')
}
