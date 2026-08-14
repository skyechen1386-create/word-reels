#!/usr/bin/env node
/**
 * 精确修复：抽象名词（-heit/-keit/-ung/-schaft/-tum/-ismus/-tät/-ion/-nis/-anz/-enz 结尾）
 * 被错误地套用了物理位置类模板句（如"XX 就在附近拐角处"），
 * 强制改用语义安全的抽象概念模板，并同步三处字段。
 */
const fs = require('fs')

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function akkArt(article) { return article === 'die' ? 'die' : article === 'der' ? 'den' : article === 'das' ? 'das' : '' }
function extractArticleAndNoun(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), noun: m[2] }
  return { article: null, noun: lemma }
}
const abstractSuffix = /(heit|keit|ung|schaft|tum|ismus|tät|ion|nis|anz|enz)$/i
const physicalMarkers = /befindet sich gleich um die Ecke|Wo finde ich hier|auf verschiedene Weise nutzen/

const abstractTemplates = [
  { de: (art, noun) => `Man diskutiert häufig über ${akkArt(art)} ${noun}.`, zh: m => `人们经常讨论${m}。` },
  { de: (art, noun) => `${cap(art || 'Die')} ${noun} ist ein wichtiges gesellschaftliches Thema.`, zh: m => `${m}是一个重要的社会议题。` },
  { de: (art, noun) => `Viele Experten befassen sich mit ${akkArt(art)} ${noun}.`, zh: m => `很多专家都在研究${m}。` },
  { de: (art, noun) => `Die Bedeutung von ${noun} wird oft unterschätzt.`, zh: m => `${m}的重要性常常被低估。` },
  { de: (art, noun) => `In den Medien wird ${akkArt(art)} ${noun} regelmäßig diskutiert.`, zh: m => `媒体经常讨论${m}。` },
]

function cleanMeaning(def) {
  if (!def) return ''
  return def.replace(/^(复合名词|复合形容词|复合动词)[：:]\s*/, '').split(/[；;]/)[0].trim()
}

function generateExamples(word) {
  const { article, noun } = extractArticleAndNoun(word.lemma)
  const meaning = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '') || noun
  const picks = []
  const used = new Set()
  while (picks.length < 2 && used.size < abstractTemplates.length) {
    const i = Math.floor(Math.random() * abstractTemplates.length)
    if (used.has(i)) continue
    used.add(i)
    const t = abstractTemplates[i]
    picks.push({ de: t.de(article, noun), zh: t.zh(meaning) })
  }
  return picks
}

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0

  words.forEach(word => {
    const m = word.lemma.match(/^(der|die|das)\s+(.+)$/i)
    if (!m || !abstractSuffix.test(m[2])) return
    const exText = (word.examples || []).map(e => e.de).join(' ')
    if (!physicalMarkers.test(exText)) return

    word.examples = generateExamples(word)
    fixedCount++

    const goodExamples = word.examples
    let cursor = 0
    const next = () => { const ex = goodExamples[cursor % goodExamples.length]; cursor++; return ex }
    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => (rm.contexts || []).forEach(ctx => { const ex = next(); ctx.exampleDe = ex.de; ctx.exampleZh = ex.zh }))
    }
    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => { if ('exampleDe' in coll || !coll.examples) { const ex = next(); coll.exampleDe = ex.de; coll.exampleZh = ex.zh } })
    }
  })

  console.log(`✅ 修正了 ${fixedCount} 个抽象名词的语义错误例句`)
  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
}

fix(process.argv[2], process.argv[3] || process.argv[2])
