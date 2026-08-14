#!/usr/bin/env node

/**
 * 全字段例句同步修复工具
 *
 * 背景：词卡详情页有三处独立显示例句的区域：
 *   1. 常用义排名与多义语境 -> rankedMeanings[].contexts[].exampleDe/exampleZh
 *   2. 例句 -> examples[]
 *   3. 固定搭配与例句 -> collocations[].exampleDe/exampleZh (或 .examples[])
 * 之前的修复只更新了 examples[]，导致另外两处仍残留旧的通用模板句
 * （如 "XXX ist in diesem Zusammenhang wichtig."），
 * 造成页面上同一个词反复出现空洞的车轱辘话，观感上等于"没有真实内容"。
 *
 * 本脚本把 examples[] 中已经修好的真实例句同步回另外两处，
 * 只替换句子内容，不改变搭配短语本身(de字段)或语境标签(sceneZh)结构。
 */

const fs = require('fs')

const genericPatterns = [
  /ist (in diesem Zusammenhang )?wichtig\.?$/i,
  /wird.*ausdrücklich erwähnt\.?$/i,
]

function isGeneric(text) {
  if (!text) return false
  return genericPatterns.some(p => p.test(text))
}

function syncVocabulary(inputPath, outputPath) {
  console.log(`📖 加载词库: ${inputPath}\n`)
  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const words = Array.isArray(data) ? data : data.entries || data.cards || data.words || []
  console.log(`✅ 总词条数: ${words.length}\n`)

  let rankedFixed = 0
  let collocFixed = 0
  let rankedTotal = 0
  let collocTotal = 0

  words.forEach(word => {
    const goodExamples = (word.examples || []).filter(ex => ex.de && !isGeneric(ex.de))
    if (goodExamples.length === 0) return // 没有可用的真实例句就跳过，不制造新问题

    let exampleCursor = 0
    const nextExample = () => {
      const ex = goodExamples[exampleCursor % goodExamples.length]
      exampleCursor++
      return ex
    }

    // 1) 修复 rankedMeanings[].contexts[]
    if (Array.isArray(word.rankedMeanings)) {
      word.rankedMeanings.forEach(rm => {
        if (!Array.isArray(rm.contexts)) return
        rm.contexts.forEach(ctx => {
          rankedTotal++
          if (isGeneric(ctx.exampleDe)) {
            const ex = nextExample()
            ctx.exampleDe = ex.de
            ctx.exampleZh = ex.zh
            rankedFixed++
          }
        })
      })
    }

    // 2) 修复 collocations[]
    if (Array.isArray(word.collocations)) {
      word.collocations.forEach(coll => {
        collocTotal++
        if (isGeneric(coll.exampleDe)) {
          const ex = nextExample()
          coll.exampleDe = ex.de
          coll.exampleZh = ex.zh
          collocFixed++
        }
        if (Array.isArray(coll.examples)) {
          coll.examples.forEach(ce => {
            if (isGeneric(ce.de)) {
              const ex = nextExample()
              ce.de = ex.de
              ce.zh = ex.zh
            }
          })
        }
      })
    }
  })

  console.log('📊 同步统计:')
  console.log('---')
  console.log(`rankedMeanings.contexts 总数: ${rankedTotal}, 修复: ${rankedFixed}`)
  console.log(`collocations 总数:            ${collocTotal}, 修复: ${collocFixed}`)

  let output
  if (Array.isArray(data)) output = words
  else if (data.entries) output = { ...data, entries: words }
  else output = { ...data, cards: words }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf8')
  console.log(`\n✅ 已保存到: ${outputPath}`)
}

const inputPath = process.argv[2]
const outputPath = process.argv[3] || inputPath.replace(/\.json$/, '_synced.json')

if (!inputPath || !fs.existsSync(inputPath)) {
  console.error('用法: node sync-all-examples.cjs <input.json> [output.json]')
  process.exit(1)
}

syncVocabulary(inputPath, outputPath)
