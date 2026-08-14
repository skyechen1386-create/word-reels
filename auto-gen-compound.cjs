#!/usr/bin/env node
/**
 * 为 wordBuilding.parts 两部分释义都完整的复合名词自动生成
 * definition.de / coreAssociation / mnemonic。
 * 内容完全基于已验证正确的 parts 数据重新组织，不编造新信息。
 */
const fs = require('fs')

function cleanMeaning(def) {
  if (!def) return ''
  return def
    .replace(/^(复合名词|复合形容词|复合动词|介词复合词|连接音复合词|形容词或副词复合词|动词词干复合词)[：:]\s*/, '')
    .split(/[；;]/)[0]
    .replace(/[。.]\s*$/, '')
    .trim()
}

function fix(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let fixedCount = 0

  words.forEach(word => {
    if (word.definition?.de) return
    if (word.wordBuilding?.type !== 'compound_noun') return
    const parts = word.wordBuilding?.parts || []
    if (parts.length < 2) return
    if (!parts.every(p => p.meaningZh && p.meaningZh.trim())) return

    const [prefix, head] = parts
    const fullZh = cleanMeaning(word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || '')

    word.definition = {
      de: `Ein zusammengesetztes Wort aus „${prefix.part}" und „${head.part}".`,
      zh: word.definition?.zh || word.dictionaryMeaning?.directZh?.[0] || fullZh,
    }
    word.coreAssociation = {
      zh: `${prefix.meaningZh} + ${head.meaningZh}`,
      de: `${prefix.part} + ${head.part}`,
    }
    word.mnemonic = {
      zh: `拆开看：${prefix.part}(${prefix.meaningZh})+${head.part}(${head.meaningZh})——${fullZh}。`,
      warningZh: '这是人为设计的记忆方法，不是真实词源。',
    }
    fixedCount++
  })

  console.log(`✅ 自动生成了 ${fixedCount} 个词条的内容`)
  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
}

fix(process.argv[2], process.argv[3] || process.argv[2])
