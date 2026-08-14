#!/usr/bin/env node
/**
 * 最终清理：
 * 1. 修正词性判断遗漏（pos 为 "N."/"V."/"Adj." 等缩写形式未被识别，
 *    导致落入默认分支，句首冠词未大写）
 * 2. 用统一、语义安全（不含物理位置断言）的名词模板替换，
 *    避免"感染风险放在桌子上"这类抽象/具体误判问题
 * 3. 强制句首字母大写
 */
const fs = require('fs')

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function akkArt(a) { return a === 'die' ? 'die' : a === 'der' ? 'den' : a === 'das' ? 'das' : '' }
function datArt(a) { return a === 'die' ? 'der' : a === 'der' ? 'dem' : a === 'das' ? 'dem' : '' }
function extractArticleAndNoun(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), noun: m[2] }
  return { article: null, noun: lemma }
}

// 统一、对具体/抽象名词都安全的模板（不作物理位置断言）
const safeNounTemplates = [
  { de: (art, noun) => `Man spricht oft über ${akkArt(art)} ${noun}.`, zh: m => `人们经常谈论${m}。` },
  { de: (art, noun) => `${cap(art || 'Die')} ${noun} spielt eine wichtige Rolle.`, zh: m => `${m}起着重要作用。` },
  { de: (art, noun) => `Viele Menschen beschäftigen sich mit ${datArt(art)} ${noun}.`, zh: m => `很多人都关注${m}。` },
  { de: (art, noun) => `${cap(art || 'Die')} ${noun} ist in diesem Bereich bekannt.`, zh: m => `${m}在这个领域很有名。` },
  { de: (art, noun) => `Es gibt viel zu wissen über ${akkArt(art)} ${noun}.`, zh: m => `关于${m}有很多值得了解的地方。` },
]

const verbTemplates = [
  { de: (v) => `Man muss regelmäßig ${v}.`, zh: m => `必须定期${m}。` },
  { de: (v) => `Es ist nicht einfach, richtig zu ${v}.`, zh: m => `正确地${m}并不容易。` },
  { de: (v) => `Viele Menschen ${v} jeden Tag.`, zh: m => `很多人每天都${m}。` },
]
const adjTemplates = [
  { de: (a) => `Das Ergebnis war überraschend ${a}.`, zh: m => `结果出乎意料地${m}。` },
  { de: (a) => `Im Vergleich dazu ist es eher ${a}.`, zh: m => `相比之下这更${m}。` },
]

function cleanMeaning(def) {
  if (!def) return ''
  return def.replace(/^(复合名词|复合形容词|复合动词)[：:]\s*/, '').split(/[；;]/)[0].trim()
}

function pick2(templates, args, meaning) {
  const picks = []; const used = new Set()
  while (picks.length < Math.min(2, templates.length) && used.size < templates.length) {
    const i = Math.floor(Math.random() * templates.length)
    if (used.has(i)) continue
    used.add(i)
    const t = templates[i]
    picks.push({ de: t.de(...args), zh: t.zh(meaning) })
  }
  return picks
}

function classifyPos(rawPos) {
  const p = (rawPos || '').toLowerCase()
  if (p.startsWith('n')) return 'noun' // Nomen, Noun, N.
  if (p.startsWith('v')) return 'verb' // Verb, V.
  if (p.startsWith('adj') || p.startsWith('a.')) return 'adj'
  return 'other'
}

function regenerate(word) {
  const kind = classifyPos(word.grammar?.pos)
  const meaning = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '') || word.lemma
  if (kind === 'noun') {
    const { article, noun } = extractArticleAndNoun(word.lemma)
    return pick2(safeNounTemplates, [article, noun], meaning)
  }
  if (kind === 'verb') {
    const bare = word.lemma.replace(/^sich\s+/, '')
    return pick2(verbTemplates, [bare], meaning)
  }
  if (kind === 'adj') {
    return pick2(adjTemplates, [word.lemma], meaning)
  }
  return [
    { de: `${cap(word.lemma)} kommt in vielen Situationen vor.`, zh: `${meaning}在很多情况下都会出现。` },
    { de: `Man begegnet ${datArt(extractArticleAndNoun(word.lemma).article) || ''} ${extractArticleAndNoun(word.lemma).noun || word.lemma} häufig im Alltag.`.replace(/\s+/g, ' '), zh: `${meaning}在日常生活中很常见。` },
  ]
}

// 需要重新处理的标志文本（上一轮遗留的问题）
const markers = [
  'kommt in vielen Situationen vor',
  'begegnet',
  'liegt auf dem Tisch',
  'Wo finde ich hier',
]

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0
  let capitalizedCount = 0

  words.forEach(word => {
    const exTexts = (word.examples || []).map(e => e.de).join(' | ')
    const needsRegen = markers.some(m => exTexts.includes(m))

    if (needsRegen) {
      word.examples = regenerate(word)
      fixedCount++
    }

    // 强制句首大写（保险措施，覆盖所有历史遗留）
    let capChanged = false
    ;(word.examples || []).forEach(e => {
      if (e.de && /^[a-zäöü]/.test(e.de)) { e.de = cap(e.de); capChanged = true }
    })
    if (capChanged) capitalizedCount++

    // 同步三处字段
    const goodEx = (word.examples || []).filter(e => e.de)
    if (goodEx.length === 0) return
    let cursor = 0
    const next = () => { const ex = goodEx[cursor % goodEx.length]; cursor++; return ex }
    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => (rm.contexts || []).forEach(ctx => { const ex = next(); ctx.exampleDe = ex.de; ctx.exampleZh = ex.zh }))
    }
    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => { if ('exampleDe' in coll || !coll.examples) { const ex = next(); coll.exampleDe = ex.de; coll.exampleZh = ex.zh } })
    }
  })

  console.log(`✅ 重新生成: ${fixedCount} 个词条`)
  console.log(`✅ 修正大写: ${capitalizedCount} 个词条`)
  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
  console.log(`已保存到: ${outputPath}`)
}

fix(process.argv[2], process.argv[3] || process.argv[2])
