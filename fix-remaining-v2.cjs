#!/usr/bin/env node

/**
 * 修复 v2：处理所有仍含模板句的词条（含"部分残留"情况），
 * 并按名词语义类型（抽象概念 / 具体事物）分别使用安全、
 * 语义合理的例句模板，避免"机会均等就在拐角处"这类荒谬病句。
 */

const fs = require('fs')

const genericPatterns = [
  /ist (in diesem Zusammenhang )?wichtig\.?$/i,
  /wird.*ausdrücklich erwähnt\.?$/i,
]
const isGeneric = t => !!t && genericPatterns.some(p => p.test(t))

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

function extractArticleAndNoun(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), noun: m[2] }
  return { article: null, noun: lemma }
}

function akkArt(article) {
  return article === 'die' ? 'die' : article === 'der' ? 'den' : article === 'das' ? 'das' : ''
}

// 抽象名词后缀（不能有物理位置/可用性）
const abstractSuffixes = /(heit|keit|ung|schaft|tum|ismus|tät|ion|nis|anz|enz)$/i

function isAbstract(noun) {
  const bareNoun = noun.replace(/^(der|die|das)\s+/i, '')
  return abstractSuffixes.test(bareNoun)
}

const abstractTemplates = [
  { de: (art, noun) => `Man diskutiert häufig über ${akkArt(art)} ${noun}.`, zh: m => `人们经常讨论${m}。` },
  { de: (art, noun) => `${cap(art || 'Die')} ${noun} ist ein wichtiges gesellschaftliches Thema.`, zh: m => `${m}是一个重要的社会议题。` },
  { de: (art, noun) => `Viele Experten befassen sich mit ${akkArt(art)} ${noun}.`, zh: m => `很多专家都在研究${m}。` },
  { de: (art, noun) => `Die Bedeutung von ${noun} wird oft unterschätzt.`, zh: m => `${m}的重要性常常被低估。` },
  { de: (art, noun) => `In den Medien wird ${akkArt(art)} ${noun} regelmäßig diskutiert.`, zh: m => `媒体经常讨论${m}。` },
]

const concreteTemplates = [
  { de: (art, noun) => `Wo finde ich hier ${art === 'die' ? 'eine' : art === 'der' ? 'einen' : 'ein'} ${noun}?`, zh: m => `这里哪里能找到${m}？` },
  { de: (art, noun) => `${cap(art || 'Der')} ${noun} befindet sich gleich um die Ecke.`, zh: m => `${m}就在附近拐角处。` },
  { de: (art, noun) => `Ohne ${akkArt(art)} ${noun} wäre das nicht möglich.`, zh: m => `没有${m}，这是不可能的。` },
  { de: (art, noun) => `Die Leute sprechen oft über ${akkArt(art)} ${noun}.`, zh: m => `人们经常谈论${m}。` },
  { de: (art, noun) => `Man kann ${akkArt(art)} ${noun} auf verschiedene Weise nutzen.`, zh: m => `${m}可以有多种使用方式。` },
]

function cleanMeaning(def) {
  if (!def) return ''
  return def.replace(/^(复合名词|复合形容词|复合动词)[：:]\s*/, '').split(/[；;]/)[0].trim()
}

function generateExamples(word) {
  const { article, noun } = extractArticleAndNoun(word.lemma)
  const meaning = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '') || noun
  const templates = isAbstract(noun) ? abstractTemplates : concreteTemplates

  const picks = []
  const usedIdx = new Set()
  while (picks.length < 2 && usedIdx.size < templates.length) {
    const i = Math.floor(Math.random() * templates.length)
    if (usedIdx.has(i)) continue
    usedIdx.add(i)
    const t = templates[i]
    picks.push({ de: t.de(article, noun), zh: t.zh(meaning) })
  }
  return picks
}

function fixVocabulary(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let regeneratedCount = 0
  let syncedRanked = 0
  let syncedColloc = 0

  words.forEach(word => {
    // 只要 examples 里还有任何一句是模板，就把整组 examples 重新生成（保证内部不再有残留）
    const hasGeneric = (word.examples || []).some(e => isGeneric(e.de))
    if (hasGeneric) {
      word.examples = generateExamples(word)
      regeneratedCount++
    }

    const goodExamples = (word.examples || []).filter(ex => ex.de && !isGeneric(ex.de))
    if (goodExamples.length === 0) return
    let cursor = 0
    const nextExample = () => { const ex = goodExamples[cursor % goodExamples.length]; cursor++; return ex }

    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => {
        (rm.contexts || []).forEach(ctx => {
          if (isGeneric(ctx.exampleDe)) {
            const ex = nextExample(); ctx.exampleDe = ex.de; ctx.exampleZh = ex.zh; syncedRanked++
          }
        })
      })
    }

    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => {
        if (isGeneric(coll.exampleDe)) {
          const ex = nextExample(); coll.exampleDe = ex.de; coll.exampleZh = ex.zh; syncedColloc++
        }
        if (Array.isArray(coll.examples)) {
          coll.examples.forEach(ce => {
            if (isGeneric(ce.de)) { const ex = nextExample(); ce.de = ex.de; ce.zh = ex.zh }
          })
        }
      })
    }
  })

  console.log(`✅ 重新生成 examples 的词条数: ${regeneratedCount}`)
  console.log(`✅ 同步修复 rankedMeanings.contexts: ${syncedRanked}`)
  console.log(`✅ 同步修复 collocations: ${syncedColloc}`)

  const output = { ...data, entries: words }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')
  console.log(`已保存到: ${outputPath}`)
}

const inputPath = process.argv[2]
const outputPath = process.argv[3] || inputPath
fixVocabulary(inputPath, outputPath)
