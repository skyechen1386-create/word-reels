#!/usr/bin/env node
/**
 * 修复 improve-examples.cjs 中模糊匹配 bug 造成的例句污染。
 *
 * 根因：getBetterExamples() 里 `key.includes(lemma.split(' ')[0])`，
 * 对于 "das X" 这样的词，split(' ')[0] 只是冠词 "das"，
 * 而 realExamples 字典里第一个 "das ..." 键（'das abgas'）
 * 几乎总是 includes('das') === true，导致所有 das/die/der 开头的词
 * 被错误地塞进了 Abgas/Wohnung/Bleistift 等无关例句。
 *
 * 本脚本：精确识别这些"泄露"的例句标记文本，排除真正属于该词的
 * 情况，对受污染词条重新生成正确的例句，并同步三处字段。
 */
const fs = require('fs')

// 泄露源 -> 真正应该拥有它的 lemma（小写，不含冠词判断均可）
const leakMarkers = [
  { text: 'Das Auto stößt viel Abgas aus.', owner: 'abgas' },
  { text: 'Die Abgase verschmutzen die Luft.', owner: 'abgas' },
  { text: 'Der Filter reduziert die Abgase.', owner: 'abgas' },
  { text: 'Das Abwasser wird gereinigt.', owner: 'abwasser' },
  { text: 'Die Fabrik leitet Abwasser in den Fluss.', owner: 'abwasser' },
  { text: 'Die Kläranlage behandelt Abwasser.', owner: 'abwasser' },
  { text: 'Ich schreibe mit einem Bleistift.', owner: 'bleistift' },
  { text: 'Der Bleistift ist gespitzt.', owner: 'bleistift' },
  { text: 'Hast du einen Bleistift für mich?', owner: 'bleistift' },
  { text: 'Der Preis ist zu hoch.', owner: 'preis' },
  { text: 'beträgt 50 Euro', owner: 'preis' },
  { text: 'Die Preise steigen ständig.', owner: 'preis' },
  { text: 'Ich suche eine neue Wohnung.', owner: 'wohnung' },
  { text: 'Die Wohnung hat drei Zimmer.', owner: 'wohnung' },
  { text: 'Die Miete für die Wohnung ist 800 Euro.', owner: 'wohnung' },
  { text: 'Der Termin ist am Freitag.', owner: 'termin' },
  { text: 'Ich habe einen wichtigen Termin.', owner: 'termin' },
  { text: 'Können wir einen Termin vereinbaren?', owner: 'termin' },
  { text: 'Die Rechnung ist bezahlt.', owner: 'rechnung' },
  { text: 'Bitte geben Sie mir die Rechnung.', owner: 'rechnung' },
  { text: 'Die Rechnung beträgt 150 Euro.', owner: 'rechnung' },
  { text: 'Das ist eine wertvolle Erfahrung.', owner: 'erfahrung' },
  { text: 'Aus meiner Erfahrung weiß ich', owner: 'erfahrung' },
  { text: 'Diese Erfahrung hat mich verändert.', owner: 'erfahrung' },
  { text: 'Ich kaufe Lebensmittel im Supermarkt.', owner: 'kaufen' },
  { text: 'Sie hat ein neues Auto gekauft.', owner: 'kaufen' },
  { text: 'Willst du etwas kaufen?', owner: 'kaufen' },
  { text: 'Ich bekomme einen Brief.', owner: 'bekommen' },
  { text: 'Hast du meine Nachricht bekommen?', owner: 'bekommen' },
  { text: 'Sie bekommt ein Kind.', owner: 'bekommen' },
  { text: 'Er sagt die Wahrheit.', owner: 'sagen' },
  { text: 'Was sagst du dazu?', owner: 'sagen' },
  { text: 'Sie sagte, dass sie später kommt.', owner: 'sagen' },
  { text: 'Ich mache meine Hausaufgaben.', owner: 'machen' },
  { text: 'Er macht einen guten Job.', owner: 'machen' },
  { text: 'Ich schreibe einen Brief.', owner: 'schreiben' },
  { text: 'Sie schreibt gerne Geschichten.', owner: 'schreiben' },
  { text: 'Schreib mir eine E-Mail!', owner: 'schreiben' },
  { text: 'Ich arbeite im Büro.', owner: 'arbeiten' },
  { text: 'Sie arbeitet als Lehrerin.', owner: 'arbeiten' },
  { text: 'Wir arbeiten zusammen.', owner: 'arbeiten' },
  { text: 'Der Unterricht beginnt um 9 Uhr.', owner: 'beginnen' },
  { text: 'Ich beginne ein neues Projekt.', owner: 'beginnen' },
  { text: 'Es beginnt zu regnen.', owner: 'beginnen' },
  { text: 'Ich verstehe dich nicht.', owner: 'verstehen' },
  { text: 'Verstehst du Deutsch?', owner: 'verstehen' },
  { text: 'Sie versteht das Problem.', owner: 'verstehen' },
  { text: 'Kannst du mir helfen?', owner: 'helfen' },
  { text: 'Ich helfe dir gerne.', owner: 'helfen' },
  { text: 'Sie hilft ihrer Mutter im Haushalt.', owner: 'helfen' },
  { text: 'Das ist ein schönes Bild.', owner: 'schön' },
  { text: 'Die Landschaft ist sehr schön.', owner: 'schön' },
  { text: 'Sie hat ein schönes Lächeln.', owner: 'schön' },
  { text: 'Das Haus ist sehr groß.', owner: 'groß' },
  { text: 'Er hat große Augen.', owner: 'groß' },
  { text: 'Das ist ein großes Problem.', owner: 'groß' },
  { text: 'Das Kind ist noch sehr klein.', owner: 'klein' },
  { text: 'Ich habe nur einen kleinen Platz.', owner: 'klein' },
  { text: 'Das ist eine kleine Stadt.', owner: 'klein' },
  { text: 'Das Auto fährt schnell.', owner: 'schnell' },
  { text: 'Sie arbeitet schnell und sorgfältig.', owner: 'schnell' },
  { text: 'Die Zeit vergeht schnell.', owner: 'schnell' },
  { text: 'Das ist eine wichtige Entscheidung.', owner: 'wichtig' },
  { text: 'Wasser ist wichtig für das Leben.', owner: 'wichtig' },
  { text: 'Es ist wichtig, gesund zu bleiben.', owner: 'wichtig' },
]

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function akkArt(a) { return a === 'die' ? 'die' : a === 'der' ? 'den' : a === 'das' ? 'das' : '' }
function datArt(a) { return a === 'die' ? 'der' : a === 'der' ? 'dem' : a === 'das' ? 'dem' : '' }
function extractArticleAndNoun(lemma) {
  const m = lemma.match(/^(der|die|das)\s+(.+)$/i)
  if (m) return { article: m[1].toLowerCase(), noun: m[2] }
  return { article: null, noun: lemma }
}
const abstractSuffix = /(heit|keit|ung|schaft|tum|ismus|tät|ion|nis|anz|enz)$/i
function isAbstract(noun) { return abstractSuffix.test(noun) }

const abstractTemplates = [
  { de: (art, noun) => `Man diskutiert häufig über ${akkArt(art)} ${noun}.`, zh: m => `人们经常讨论${m}。` },
  { de: (art, noun) => `${cap(art || 'Die')} ${noun} ist ein wichtiges Thema.`, zh: m => `${m}是一个重要话题。` },
  { de: (art, noun) => `Viele Experten befassen sich mit ${datArt(art)} ${noun}.`, zh: m => `很多专家都在研究${m}。` },
  { de: (art, noun) => `In den Medien wird ${art || 'die'} ${noun} regelmäßig diskutiert.`, zh: m => `媒体经常讨论${m}。` },
]
const concreteTemplates = [
  { de: (art, noun) => `Wo finde ich hier ${art === 'die' ? 'eine' : art === 'der' ? 'einen' : 'ein'} ${noun}?`, zh: m => `这里哪里能找到${m}？` },
  { de: (art, noun) => `${cap(art || 'Der')} ${noun} liegt auf dem Tisch.`, zh: m => `${m}放在桌子上。` },
  { de: (art, noun) => `Ohne ${akkArt(art)} ${noun} wäre das nicht möglich.`, zh: m => `没有${m}，这是不可能的。` },
  { de: (art, noun) => `Man braucht ${art === 'die' ? 'eine' : art === 'der' ? 'einen' : 'ein'} ${noun} für diese Aufgabe.`, zh: m => `完成这项任务需要${m}。` },
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

function regenerate(word) {
  const pos = (word.grammar?.pos || '').toLowerCase()
  const meaning = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '') || word.lemma
  if (pos.includes('nomen') || pos.includes('noun')) {
    const { article, noun } = extractArticleAndNoun(word.lemma)
    const templates = isAbstract(noun) ? abstractTemplates : concreteTemplates
    return pick2(templates, [article, noun], meaning)
  }
  if (pos.includes('verb')) {
    const bare = word.lemma.replace(/^sich\s+/, '')
    return pick2(verbTemplates, [bare], meaning)
  }
  if (pos.includes('adj')) {
    return pick2(adjTemplates, [word.lemma], meaning)
  }
  return [
    { de: `${word.lemma} kommt in vielen Situationen vor.`, zh: `${meaning}在很多情况下都会出现。` },
    { de: `Man begegnet ${word.lemma} häufig im Alltag.`, zh: `${meaning}在日常生活中很常见。` },
  ]
}

function ownerMatchesLemma(owner, lemma) {
  const lemmaLower = lemma.toLowerCase()
  return lemmaLower.includes(owner)
}

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0
  const fixedList = []

  words.forEach(word => {
    const exTexts = (word.examples || []).map(e => e.de).join(' | ')
    const leaked = leakMarkers.find(marker => exTexts.includes(marker.text) && !ownerMatchesLemma(marker.owner, word.lemma))
    if (!leaked) return

    word.examples = regenerate(word)
    fixedCount++
    fixedList.push({ lemma: word.lemma, leakedFrom: leaked.owner })

    const goodEx = word.examples.filter(e => e.de)
    let cursor = 0
    const next = () => { const ex = goodEx[cursor % goodEx.length]; cursor++; return ex }
    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => (rm.contexts || []).forEach(ctx => { const ex = next(); ctx.exampleDe = ex.de; ctx.exampleZh = ex.zh }))
    }
    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => { if ('exampleDe' in coll || !coll.examples) { const ex = next(); coll.exampleDe = ex.de; coll.exampleZh = ex.zh } })
    }
  })

  console.log(`✅ 修复了 ${fixedCount} 个被污染的词条`)
  console.log('\n前30个示例:')
  fixedList.slice(0, 30).forEach(f => console.log(`  ${f.lemma}  (原本泄露自: ${f.leakedFrom})`))

  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
  console.log(`\n已保存到: ${outputPath}`)
}

fix(process.argv[2], process.argv[3] || process.argv[2])
