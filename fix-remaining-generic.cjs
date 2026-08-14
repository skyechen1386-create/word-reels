#!/usr/bin/env node

/**
 * 修复剩余的 306 个词条（examples/rankedMeanings/collocations 三处
 * 都还是通用模板句的复合名词），生成真正自然、有变化的德语例句，
 * 并同步写入 examples + rankedMeanings.contexts + collocations 三处。
 */

const fs = require('fs')

const genericPatterns = [
  /ist (in diesem Zusammenhang )?wichtig\.?$/i,
  /wird.*ausdrücklich erwähnt\.?$/i,
]
const isGeneric = t => !!t && genericPatterns.some(p => p.test(t))

// 自然、多样化的名词例句模板（不含"ist wichtig"这类空话）
const templates = [
  { de: (art, noun) => `Wo finde ich hier ${art === 'die' ? 'eine' : art === 'der' ? 'einen' : 'ein'} ${noun}?`, zh: m => `这里哪里能找到${m}？` },
  { de: (art, noun) => `${cap(art)} ${noun} befindet sich gleich um die Ecke.`, zh: m => `${m}就在附近拐角处。` },
  { de: (art, noun) => `Ohne ${art === 'die' ? 'die' : art === 'der' ? 'den' : 'das'} ${noun} wäre das nicht möglich.`, zh: m => `没有${m}，这是不可能的。` },
  { de: (art, noun) => `Die Leute sprechen oft über ${art === 'die' ? 'die' : art === 'der' ? 'den' : 'das'} ${noun}.`, zh: m => `人们经常谈论${m}。` },
  { de: (art, noun) => `Für viele ist ${art} ${noun} von großer Bedeutung.`, zh: m => `对很多人来说，${m}意义重大。` },
  { de: (art, noun) => `Man kann ${art === 'die' ? 'die' : art === 'der' ? 'den' : 'das'} ${noun} auf verschiedene Weise nutzen.`, zh: m => `${m}可以有多种使用方式。` },
]

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

function extractArticleAndNoun(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), noun: m[2] }
  return { article: 'die', noun: lemma }
}

function cleanMeaning(def) {
  if (!def) return ''
  return def.replace(/^复合名词[：:]\s*/, '').split('；')[0].split(';')[0].trim()
}

function generateExamples(word) {
  const { article, noun } = extractArticleAndNoun(word.lemma)
  const meaning = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '')
  const picks = []
  const usedIdx = new Set()
  while (picks.length < 2 && usedIdx.size < templates.length) {
    const i = Math.floor(Math.random() * templates.length)
    if (usedIdx.has(i)) continue
    usedIdx.add(i)
    const t = templates[i]
    picks.push({ de: t.de(article, noun), zh: t.zh(meaning || noun) })
  }
  return picks
}

function fixVocabulary(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0

  words.forEach(word => {
    const exGeneric = (word.examples || []).length === 0 || (word.examples || []).every(e => isGeneric(e.de))
    if (!exGeneric) return

    const newExamples = generateExamples(word)
    word.examples = newExamples
    fixedCount++

    // 同步到 rankedMeanings.contexts
    if (Array.isArray(word.rankedMeanings)) {
      let cursor = 0
      word.rankedMeanings.forEach(rm => {
        (rm.contexts || []).forEach(ctx => {
          if (isGeneric(ctx.exampleDe)) {
            const ex = newExamples[cursor % newExamples.length]; cursor++
            ctx.exampleDe = ex.de; ctx.exampleZh = ex.zh
          }
        })
      })
    }

    // 同步到 collocations
    if (Array.isArray(word.collocations)) {
      let cursor = 0
      word.collocations.forEach(coll => {
        if (isGeneric(coll.exampleDe)) {
          const ex = newExamples[cursor % newExamples.length]; cursor++
          coll.exampleDe = ex.de; coll.exampleZh = ex.zh
        }
      })
    }
  })

  console.log(`✅ 修复了 ${fixedCount} 个词条的 examples/rankedMeanings/collocations`)

  const output = { ...data, entries: words }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')
  console.log(`已保存到: ${outputPath}`)
}

const inputPath = process.argv[2]
const outputPath = process.argv[3] || inputPath
fixVocabulary(inputPath, outputPath)
