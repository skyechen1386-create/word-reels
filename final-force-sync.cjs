#!/usr/bin/env node
/**
 * 最终强制同步：不再依赖正则匹配旧模板，直接对全部 4127 词条，
 * 用 examples[] 的内容循环填充 rankedMeanings.contexts[] 和
 * collocations[] 的例句字段，确保详情页三处显示的内容永远一致。
 */
const fs = require('fs')

function fixVocabulary(inputPath, outputPath) {
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = data.entries
  let touched = 0

  words.forEach(word => {
    const goodExamples = (word.examples || []).filter(ex => ex.de && ex.de.trim())
    if (goodExamples.length === 0) return
    let cursor = 0
    const next = () => { const ex = goodExamples[cursor % goodExamples.length]; cursor++; return ex }

    let changed = false
    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => {
        (rm.contexts || []).forEach(ctx => {
          const ex = next()
          if (ctx.exampleDe !== ex.de) changed = true
          ctx.exampleDe = ex.de
          ctx.exampleZh = ex.zh
        })
      })
    }
    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => {
        if ('exampleDe' in coll || !coll.examples) {
          const ex = next()
          if (coll.exampleDe !== ex.de) changed = true
          coll.exampleDe = ex.de
          coll.exampleZh = ex.zh
        }
      })
    }
    if (changed) touched++
  })

  console.log(`✅ 强制同步了 ${touched} 个词条`)
  fs.writeFileSync(outputPath, JSON.stringify({ ...data, entries: words }, null, 2), 'utf8')
  console.log(`已保存到: ${outputPath}`)
}

const inputPath = process.argv[2]
const outputPath = process.argv[3] || inputPath
fixVocabulary(inputPath, outputPath)
