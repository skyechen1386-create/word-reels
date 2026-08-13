import type { WordEntry } from '../types'
import type { ContextExample, ContextMaterial } from './acquisitionTypes'
import { getCachedAcquisitionStats, setCachedAcquisitionStats } from '../db'

/**
 * 从词条中提取语境材料
 * 收集多个例句支持多轮猜测
 */
export function extractContextMaterial(entry: WordEntry): ContextMaterial | null {
  if (!entry.id || !entry.language || !entry.lemma) return null

  const primaryZh = getPrimaryZh(entry)
  if (!primaryZh) return null

  const meaningRank = 1
  const allContexts = collectAllContexts(entry, meaningRank)

  if (allContexts.length === 0) {
    return null // C 类：无语境
  }

  // 最多收集 4 个不同场景的例句供多轮猜测
  const selectedContexts = selectDiverseContexts(allContexts, 4)

  const material: ContextMaterial = {
    entryId: entry.id,
    lemma: entry.lemma,
    meaningRank,
    class: selectedContexts.length >= 2 ? 'A' : 'B',
    primaryZh,
    coreDe: getCoreGermanDefinition(entry),
    contexts: selectedContexts,
    recallPattern: extractRecallPattern(entry),
    recallZh: extractRecallZh(entry),
    tags: entry.tags,
    grammar: entry.grammar,
    pronunciation: entry.pronunciation,
  }

  return material
}

/**
 * 从词条获取首选中文释义
 */
function getPrimaryZh(entry: WordEntry): string | null {
  // 尝试多个字段名变体
  if (typeof (entry as any).meaning?.primaryZh === 'string') {
    return (entry as any).meaning.primaryZh
  }
  if (typeof (entry as any).meaning?.coreZh === 'string') {
    return (entry as any).meaning.coreZh
  }
  if (entry.dictionaryMeaning?.directZh?.[0]) {
    return entry.dictionaryMeaning.directZh[0]
  }
  if (entry.rankedMeanings?.[0]?.zh) {
    return entry.rankedMeanings[0].zh
  }
  if (entry.definition?.zh) {
    return entry.definition.zh
  }
  return null
}

/**
 * 获取德语核心定义
 */
function getCoreGermanDefinition(entry: WordEntry): string | undefined {
  if (entry.definition?.de) return entry.definition.de
  if ((entry as any).meaning?.coreDe) return (entry as any).meaning.coreDe
  if ((entry as any).matrix?.coreModelDe) return (entry as any).matrix.coreModelDe
  if (entry.rankedMeanings?.[0]?.de) return entry.rankedMeanings[0].de
  return undefined
}

/**
 * 收集所有可用的语境例句，按优先级排序
 * 优先级：examples > collocations.examples > collocations.exampleDe > rankedMeanings.contexts
 */
function collectAllContexts(entry: WordEntry, meaningRank: number): ContextExample[] {
  const contexts: ContextExample[] = []
  const seen = new Set<string>()

  // 来源1：examples（最丰富）
  if (Array.isArray(entry.examples)) {
    entry.examples.forEach(ex => {
      if (ex.de && ex.de.trim()) {
        const key = ex.de.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          contexts.push({
            de: ex.de,
            zh: ex.zh,
            source: 'examples',
          })
        }
      }
    })
  }

  // 来源2&3：collocations
  if (Array.isArray(entry.collocations)) {
    entry.collocations.forEach(coll => {
      // 来源2a：collocations[].examples
      if (Array.isArray(coll.examples)) {
        coll.examples.forEach(ex => {
          if (ex.de && ex.de.trim()) {
            const key = ex.de.toLowerCase()
            if (!seen.has(key)) {
              seen.add(key)
              contexts.push({
                de: ex.de,
                zh: ex.zh,
                source: 'collocations.examples',
              })
            }
          }
        })
      }

      // 来源2b：collocations[].exampleDe
      if (coll.exampleDe && coll.exampleDe.trim()) {
        const key = coll.exampleDe.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          contexts.push({
            de: coll.exampleDe,
            zh: coll.exampleZh,
            source: 'collocations.exampleDe',
          })
        }
      }
    })
  }

  // 来源3：rankedMeanings.contexts
  if (Array.isArray(entry.rankedMeanings)) {
    const rm = entry.rankedMeanings.find(m => m.rank === meaningRank)
    if (rm?.contexts && Array.isArray(rm.contexts)) {
      rm.contexts.forEach(ctx => {
        if (ctx.exampleDe && ctx.exampleDe.trim()) {
          const key = ctx.exampleDe.toLowerCase()
          if (!seen.has(key)) {
            seen.add(key)
            contexts.push({
              de: ctx.exampleDe,
              zh: ctx.exampleZh,
              source: 'rankedMeanings.contexts',
            })
          }
        }
      })
    }
  }

  // 备选降级：definition.de 和 matrix.coreModelDe
  if (contexts.length === 0) {
    if (entry.definition?.de && entry.definition.de.trim()) {
      contexts.push({
        de: entry.definition.de,
        source: 'definition.de',
      })
    }
    if ((entry as any).matrix?.coreModelDe && (entry as any).matrix.coreModelDe.trim()) {
      contexts.push({
        de: (entry as any).matrix.coreModelDe,
        source: 'matrix.coreModelDe',
      })
    }
  }

  return contexts
}

/**
 * 从多个语境中选择多个场景不同的例句
 * 优先选择不同来源、不同主体的例句
 */
function selectDiverseContexts(allContexts: ContextExample[], maxCount: number): ContextExample[] {
  if (allContexts.length <= maxCount) {
    return allContexts
  }

  const selected: ContextExample[] = []
  const usedSources = new Set<string>()

  // 第一个必选
  if (allContexts.length > 0) {
    selected.push(allContexts[0])
    usedSources.add(allContexts[0].source)
  }

  // 优先选择不同来源的例句
  for (const ctx of allContexts.slice(1)) {
    if (selected.length >= maxCount) break
    if (!usedSources.has(ctx.source)) {
      selected.push(ctx)
      usedSources.add(ctx.source)
    }
  }

  // 如果还不够，用任何例句填充
  for (const ctx of allContexts.slice(1)) {
    if (selected.length >= maxCount) break
    if (!selected.includes(ctx)) {
      selected.push(ctx)
    }
  }

  return selected
}

/**
 * 提取用于主动回忆的固定搭配
 * 例如：ein Angebot ablehnen
 */
function extractRecallPattern(entry: WordEntry): string | undefined {
  if (entry.collocations?.[0]?.de) {
    return entry.collocations[0].de
  }
  return undefined
}

/**
 * 提取搭配的中文翻译
 */
function extractRecallZh(entry: WordEntry): string | undefined {
  if (entry.collocations?.[0]?.zh) {
    return entry.collocations[0].zh
  }
  return undefined
}

/**
 * 统计词库中各级词条的数量
 * 支持缓存，大规模词库时性能更好
 */
export async function classifyAllMaterials(entries: WordEntry[]): Promise<{
  total: number
  classA: number
  classB: number
  classC: number
  materials: Map<string, ContextMaterial>
}> {
  // 尝试使用缓存的统计信息
  const cached = await getCachedAcquisitionStats()
  if (cached) {
    // 缓存命中，只需要提取指定词条的材料
    const materials = new Map<string, ContextMaterial>()
    entries.forEach(entry => {
      const material = extractContextMaterial(entry)
      if (material) {
        materials.set(entry.id, material)
      }
    })
    return {
      total: entries.length,
      ...cached,
      materials,
    }
  }

  // 缓存未命中，进行完整计算
  const materials = new Map<string, ContextMaterial>()
  let classA = 0
  let classB = 0
  let classC = 0

  entries.forEach(entry => {
    const material = extractContextMaterial(entry)
    if (material) {
      materials.set(entry.id, material)
      if (material.class === 'A') classA++
      else if (material.class === 'B') classB++
    } else {
      classC++
    }
  })

  // 缓存计算结果
  await setCachedAcquisitionStats({ classA, classB, classC })

  return {
    total: entries.length,
    classA,
    classB,
    classC,
    materials,
  }
}
